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
afterEach(()=>jest.useRealTimers());
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
