import { useRef, useState } from 'react';
import { Linking, Pressable, Text, View } from 'react-native';
import { SecondaryButton } from '@/components/SecondaryButton';
import { requestAccountDeletion } from '@/lib/api';

const PRIVACY_URL = 'https://gridgo.talasora.com/privacy';

export function PrivacyPolicyLink() {
  const [failed, setFailed] = useState(false);
  return <View className="gap-2">
    <Pressable accessibilityRole="link" accessibilityLabel="Privacy Policy" className="gg-touch min-h-11 justify-center" onPress={() => { setFailed(false); void Linking.openURL(PRIVACY_URL).catch(() => setFailed(true)); }}>
      <Text className="text-body font-medium text-text-primary">Privacy Policy</Text>
    </Pressable>
    {failed ? <Text selectable accessibilityRole="alert" className="text-body text-text-secondary">Open {PRIVACY_URL} in your browser.</Text> : null}
  </View>;
}

export function AccountPrivacy() {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const inFlight = useRef(false);
  async function submit() {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setError('');
    try { await requestAccountDeletion(); setSent(true); setConfirming(false); }
    catch { setError('Could not send your request. Try again.'); }
    finally { inFlight.current = false; setBusy(false); }
  }
  return <View className="gap-3">
    <PrivacyPolicyLink />
    {sent ? <Text accessibilityLiveRegion="polite" className="text-body text-text-primary">We will delete your account within 30 days</Text> : confirming ? <View className="gg-card gap-3">
      <Text accessibilityRole="header" className="text-h3 text-text-primary">Request account deletion?</Text>
      <Text className="text-body text-text-secondary">Operations will delete your GRIDGO sign-in and personal data. You will lose access across GRIDGO apps, and deletion cannot be undone. Records that must be retained are explained in the Privacy Policy.</Text>
      <Text className="text-body text-text-secondary">This sends a request for manual processing within 30 days. Your account stays available while the request is reviewed.</Text>
      {error ? <Text accessibilityRole="alert" className="text-body text-error">{error}</Text> : null}
      <SecondaryButton label={busy ? 'Sending request…' : 'Send deletion request'} disabled={busy} onPress={() => void submit()} />
      <SecondaryButton label="Cancel" disabled={busy} onPress={() => { setConfirming(false); setError(''); }} />
    </View> : <SecondaryButton label="Delete account" onPress={() => setConfirming(true)} />}
  </View>;
}
