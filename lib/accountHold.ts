export function accountHold(user: {
  accountStatus?: string | null;
  accountStatusReason?: string | null;
} | null | undefined): { title: string; reason: string } | null {
  if (user?.accountStatus === "suspended") {
    return { title: "This account is suspended.", reason: user.accountStatusReason ?? "" };
  }
  if (user?.accountStatus === "removed") {
    return { title: "This account has been removed.", reason: user.accountStatusReason ?? "" };
  }
  return null;
}
