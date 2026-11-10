import { Linking, Platform } from "react-native";

/**
 * Hand a join link to Facebook Messenger, the chat most shops already use.
 *
 * Messenger's own share URL opens its "send to" picker with the link filled
 * in. Whether it is installed is only known by trying: the open is refused on a
 * phone without it, and a browser cannot tell at all — so web reports
 * "not opened" rather than claim a hand-off that may not have happened.
 */
export function messengerShareUrl(link: string): string {
  return `fb-messenger://share/?link=${encodeURIComponent(link)}`;
}

export async function openInMessenger(
  link: string,
  open: (url: string) => Promise<unknown> = (url) => Linking.openURL(url),
  platform: string = Platform.OS,
): Promise<boolean> {
  if (platform === "web") return false;
  try {
    await open(messengerShareUrl(link));
    return true;
  } catch {
    return false;
  }
}
