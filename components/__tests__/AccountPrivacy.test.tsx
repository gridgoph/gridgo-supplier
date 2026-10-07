import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Linking } from 'react-native';
import { AccountPrivacy, PrivacyPolicyLink } from '../AccountPrivacy';
import { requestAccountDeletion } from '@/lib/api';
jest.mock('@/lib/api', () => ({ requestAccountDeletion: jest.fn() }));
const send = requestAccountDeletion as jest.Mock;
beforeEach(() => { send.mockReset().mockResolvedValue({ ok: true, message: 'We will delete your account within 30 days' }); });
it('confirms, allows cancel, then sends one request and shows the deadline', async () => {
  await render(<AccountPrivacy />);
  await fireEvent.press(screen.getByText('Delete account'));
  expect(send).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByText('Cancel'));
  expect(screen.queryByText('Send deletion request')).toBeNull();
  await fireEvent.press(screen.getByText('Delete account'));
  await fireEvent.press(screen.getByText('Send deletion request'));
  await waitFor(() => expect(screen.getByText('We will delete your account within 30 days')).toBeTruthy());
  expect(send).toHaveBeenCalledTimes(1);
});
it('keeps failure visible and permits retry', async () => {
  send.mockRejectedValueOnce(new Error('offline'));
  await render(<AccountPrivacy />);
  await fireEvent.press(screen.getByText('Delete account'));
  await fireEvent.press(screen.getByText('Send deletion request'));
  await waitFor(() => expect(screen.getByText('Could not send your request. Try again.')).toBeTruthy());
  await fireEvent.press(screen.getByText('Send deletion request'));
  await waitFor(() => expect(screen.getByText('We will delete your account within 30 days')).toBeTruthy());
});
it('opens the live Privacy Policy', async () => {
  const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
  await render(<PrivacyPolicyLink />);
  await fireEvent.press(screen.getByText('Privacy Policy'));
  expect(open).toHaveBeenCalledWith('https://gridgo.talasora.com/privacy');
  open.mockRestore();
});
