import { Linking, Platform } from "react-native";
import { useAlertsStore } from "@/store/alerts";
import {act,renderHook} from "@testing-library/react-native";
import {usePushNotifications} from "@/hooks/usePushNotifications";
import {useSession} from "@/store/session";
import {invalidate} from "@/lib/live";
import * as api from "@/lib/api";
let mockReady=false;
const mockPush=jest.fn();
const mockLast=jest.fn();
jest.mock("expo-router",()=>({useRouter:()=>({push:mockPush}),useRootNavigationState:()=>mockReady?{key:"root"}:undefined}));
jest.mock("expo-notifications",()=>({
  setNotificationHandler:jest.fn(),getLastNotificationResponseAsync:()=>mockLast(),clearLastNotificationResponseAsync:jest.fn(async()=>{}),
  addNotificationResponseReceivedListener:jest.fn(()=>({remove:jest.fn()})),addNotificationReceivedListener:jest.fn(()=>({remove:jest.fn()})),addPushTokenListener:jest.fn(()=>({remove:jest.fn()}))
}));
jest.mock("@/store/push",()=>({usePush:{getState:()=>({registerIfGranted:jest.fn(),adoptToken:jest.fn()})}}));
jest.mock("@/lib/api",()=>({...jest.requireActual("@/lib/api"),listNotifications:jest.fn(),getOrder:jest.fn()}));
const user={id:"owner",role:"supplier" as const,name:"Owner",email:"owner@test",verificationStatus:"pending" as const};
const response={notification:{request:{identifier:"push_one",content:{data:{notificationId:"n",orderId:"o"}}}}};
beforeEach(()=>{
  jest.useFakeTimers();jest.clearAllMocks();mockReady=false;
  useSession.setState({user,loading:false,sessionWait:null});
  mockLast.mockResolvedValue(response);
  (api.listNotifications as jest.Mock).mockResolvedValue([{id:"n",userId:"owner",title:"Decision",orderId:"o"}]);
});
const realOS=Platform.OS;
afterEach(()=>{jest.useRealTimers();Object.defineProperty(Platform,"OS",{value:realOS,configurable:true});});
/** The release tests are about an Android install; the jest preset runs as iOS. */
const onAndroid=()=>Object.defineProperty(Platform,"OS",{value:"android",configurable:true});
it("waits for a real navigator then opens a pending applicant's authorized decision once",async()=>{
  const view=await renderHook(()=>usePushNotifications());
  await act(async()=>{jest.advanceTimersByTime(100);});
  expect(mockPush).not.toHaveBeenCalled();
  mockReady=true;await view.rerender(undefined);
  await act(async()=>{jest.advanceTimersByTime(100);});
  expect(mockPush).toHaveBeenCalledTimes(1);
  expect(mockPush).toHaveBeenCalledWith("/alerts");
});
it("retains an offline tap and retries after reconnect",async()=>{
  mockReady=true;
  (api.listNotifications as jest.Mock).mockRejectedValueOnce(new Error("offline"));
  await renderHook(()=>usePushNotifications());
  await act(async()=>{jest.advanceTimersByTime(100);});
  expect(mockPush).not.toHaveBeenCalled();
  await act(async()=>{invalidate("*");});
  expect(mockPush).toHaveBeenCalledTimes(1);
});
it("routes an older notification absent from the inbox page to the authorized inbox",async()=>{
  mockReady=true;(api.listNotifications as jest.Mock).mockResolvedValue([]);
  await renderHook(()=>usePushNotifications());
  await act(async()=>{jest.advanceTimersByTime(100);});
  expect(mockPush).toHaveBeenCalledWith("/alerts");
});

it("waits for session hydration to finish after the navigator is ready",async()=>{
  mockReady=true;useSession.setState({loading:true});
  await renderHook(()=>usePushNotifications());
  await act(async()=>{jest.advanceTimersByTime(100);});
  expect(mockPush).not.toHaveBeenCalled();
  await act(async()=>{useSession.setState({loading:false});});
  await act(async()=>{jest.advanceTimersByTime(100);});
  expect(mockPush).toHaveBeenCalledTimes(1);
});

it("keeps a newer screen reconciliation when an older foreground push read returns", async () => {
  mockLast.mockResolvedValue(null);
  useAlertsStore.setState({ unreadCount: 0, dismissed: [], deleted: [] });
  let receive!: (items: api.Notification[]) => void;
  (api.listNotifications as jest.Mock)
    .mockReturnValueOnce(new Promise((resolve) => { receive = resolve; }))
    .mockResolvedValue([{ id: "one", read: false }, { id: "two", read: false }]);
  await renderHook(() => usePushNotifications());
  const notifications = jest.requireMock("expo-notifications");
  const onPush = notifications.addNotificationReceivedListener.mock.calls.at(-1)[0] as () => void;
  await act(async () => { onPush(); });
  await act(async () => { await useAlertsStore.getState().refresh(); });
  expect(useAlertsStore.getState().unreadCount).toBe(2);
  await act(async () => { receive([{ id: "one", read: false } as api.Notification]); });
  expect(useAlertsStore.getState().unreadCount).toBe(2);
});


it.each(["cold start", "background"])("opens release download while signed out from %s", async mode => {
  onAndroid();
  const open = jest.spyOn(Linking, "openURL").mockResolvedValue(undefined);
  useSession.setState({ user: null });
  const release = { notification: { request: { identifier: "release-tap", content: {
    title: "GRIDGO Supplier 1.0.123 is ready", data: { type: "announcement" },
  } } } };
  mockLast.mockResolvedValue(mode === "cold start" ? release : null);
  const view = await renderHook(() => usePushNotifications());
  if (mode === "background") {
    const onTap = jest.requireMock("expo-notifications").addNotificationResponseReceivedListener.mock.calls.at(-1)[0];
    await act(async () => { onTap(release); onTap(release); });
  }
  await act(async () => { jest.advanceTimersByTime(100); });
  expect(open).toHaveBeenCalledWith("https://gridgo.talasora.com/downloads/gridgo-supplier.apk");
  expect(open).toHaveBeenCalledTimes(1);
  expect(jest.requireMock("expo-notifications").clearLastNotificationResponseAsync).toHaveBeenCalledTimes(1);
  expect(mockPush).not.toHaveBeenCalled();
  await view.unmount();
  open.mockRestore();
});

it("opens Google Play, never the APK download, from a Play notice on a Play build", async () => {
  onAndroid();
  process.env.EXPO_PUBLIC_APP_DISTRIBUTION = "play";
  const open = jest.spyOn(Linking, "openURL").mockResolvedValue(undefined);
  useSession.setState({ user: null });
  mockLast.mockResolvedValue({ notification: { request: { identifier: "play-tap", content: {
    title: "GRIDGO Supplier 1.0.123 is on the Play Store",
    data: { type: "announcement", releaseChannel: "play", storeTarget: "play_store" },
  } } } });
  const view = await renderHook(() => usePushNotifications());
  await act(async () => { jest.advanceTimersByTime(100); });
  expect(open).toHaveBeenCalledTimes(1);
  expect(open).toHaveBeenCalledWith("market://details?id=ph.gridgo.supplier");
  expect(mockPush).not.toHaveBeenCalled();
  await view.unmount();
  open.mockRestore();
  delete process.env.EXPO_PUBLIC_APP_DISTRIBUTION;
});

it("opens TestFlight from a TestFlight notice on an iPhone, and ignores the APK notice there", async () => {
  Object.defineProperty(Platform, "OS", { value: "ios", configurable: true });
  const open = jest.spyOn(Linking, "openURL").mockResolvedValue(undefined);
  useSession.setState({ user: null });
  mockLast.mockResolvedValue(null);
  const view = await renderHook(() => usePushNotifications());
  const onTap = jest.requireMock("expo-notifications").addNotificationResponseReceivedListener.mock.calls.at(-1)[0];
  await act(async () => {
    onTap({ notification: { request: { identifier: "apk-tap", content: {
      title: "GRIDGO Supplier 1.0.123 is ready", data: { type: "announcement", releaseChannel: "apk", storeTarget: "apk_download" },
    } } } });
    onTap({ notification: { request: { identifier: "ios-tap", content: {
      title: "GRIDGO Supplier 1.0.123 is in TestFlight", data: { type: "announcement", releaseChannel: "ios", storeTarget: "testflight" },
    } } } });
  });
  await act(async () => { jest.advanceTimersByTime(100); });
  expect(open.mock.calls).toEqual([["itms-beta://"]]);
  await view.unmount();
  open.mockRestore();
});
