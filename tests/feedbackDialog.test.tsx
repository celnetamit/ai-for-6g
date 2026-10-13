// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import FeedbackDialog from '../components/ui/FeedbackDialog';

/**
 * Can the form actually be filled in?
 *
 * This looks like a test of something too basic to need one. It exists because
 * the answer was no. The modal shell was declared inside the component's render
 * body, and React identifies a component by its type — a function defined
 * during render is a new type every time, so React unmounted and remounted the
 * whole dialog on every keystroke. Typing "Hello" into the name field left "H",
 * and focus moved to the body.
 *
 * Nothing else caught it. The validation tests never type, and a browser check
 * that submits an empty form and reads the error messages passes against a
 * dialog nobody can complete. So the regression test is the boring one: put
 * characters in, and require them all to still be there.
 */

afterEach(cleanup);

// The dialog deliberately persists a draft so an accidental refresh does not
// lose a long report. That is the right behaviour and it leaks between tests:
// without this, the "names every missing field" case below loads the draft the
// typing test left behind and finds the fields already filled in.
beforeEach(() => {
  sessionStorage.clear();
});

describe('the feedback dialog', () => {
  it('keeps every character typed into a field, and keeps focus', () => {
    render(<FeedbackDialog screen="Dashboard" onClose={() => undefined} />);

    const name = screen.getByLabelText('Name') as HTMLInputElement;
    name.focus();

    // One change event per character, as a keyboard produces.
    for (const value of ['H', 'He', 'Hel', 'Hell', 'Hello']) {
      fireEvent.change(name, { target: { value } });
    }

    expect(name.value).toBe('Hello');
    expect(document.activeElement).toBe(name);
  });

  it('keeps the message field independent of the others', () => {
    render(<FeedbackDialog screen="Dashboard" onClose={() => undefined} />);

    const email = screen.getByLabelText('Email') as HTMLInputElement;
    const message = screen.getByLabelText('Message') as HTMLTextAreaElement;

    fireEvent.change(email, { target: { value: 'a@example.org' } });
    fireEvent.change(message, { target: { value: 'The element sweep looks wrong at low N.' } });

    expect(email.value).toBe('a@example.org');
    expect(message.value).toBe('The element sweep looks wrong at low N.');
  });

  it('reports the screen the sender was on', () => {
    render(<FeedbackDialog screen="Experiment workspace (/experiments/irs-coverage)" onClose={() => undefined} />);
    expect(screen.getByText(/Experiment workspace/)).toBeTruthy();
  });

  it('closes on Escape', () => {
    let closed = false;
    render(<FeedbackDialog screen="Dashboard" onClose={() => { closed = true; }} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(closed).toBe(true);
  });

  it('names every missing field rather than silently refusing to send', () => {
    render(<FeedbackDialog screen="Dashboard" onClose={() => undefined} />);
    // The submit button inside the dialog, not the one that opened it.
    fireEvent.click(screen.getByRole('button', { name: 'Send feedback' }));
    expect(screen.getByText(/Please give a name/)).toBeTruthy();
    expect(screen.getByText(/nothing to send yet/i)).toBeTruthy();
  });
});
