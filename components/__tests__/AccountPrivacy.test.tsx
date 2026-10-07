import { fireEvent, render, screen } from '@testing-library/react-native';
import { Linking } from 'react-native';
import { DangerZone, PrivacyPolicyButton, PrivacyPolicyLink } from '../AccountPrivacy';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({ router: { push: (...args: unknown[]) => mockPush(...args) } }));

/*
 * One press per test: a second press empties every later render in the file
 * on this stack (see AGENTS.md).
 */
it('draws the Privacy Policy as its own button that opens the live policy', async () => {
  const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
  await render(<PrivacyPolicyButton />);
  expect(screen.getByText('What GRIDGO collects, why, and how long it keeps it')).toBeTruthy();
  // Deletion is no longer drawn beside the policy.
  expect(screen.queryByText('Delete account')).toBeNull();
  fireEvent.press(screen.getByLabelText('Privacy Policy'));
  expect(open).toHaveBeenCalledWith('https://gridgo.talasora.com/privacy');
  open.mockRestore();
});

it('marks the danger zone in words, and says a password confirms the deletion', async () => {
  await render(<DangerZone confirmBy="password" />);
  expect(screen.getByText('DANGER ZONE')).toBeTruthy();
  expect(screen.getByText(/type your password to confirm it is you/)).toBeTruthy();
});

it('tells a Google-only account it will confirm with an emailed code', async () => {
  await render(<DangerZone confirmBy="email_code" />);
  expect(screen.getByText(/type a code we email you/)).toBeTruthy();
});

it('keeps the inline policy link for forms', async () => {
  await render(<PrivacyPolicyLink />);
  expect(screen.getByLabelText('Privacy Policy')).toBeTruthy();
});

it('opens the Delete account screen and sends nothing from the profile itself', async () => {
  await render(<DangerZone confirmBy="password" />);
  fireEvent.press(screen.getByRole('button', { name: 'Delete account' }));
  expect(mockPush).toHaveBeenCalledWith('/delete-account');
});
