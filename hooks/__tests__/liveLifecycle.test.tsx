import { act, renderHook } from "@testing-library/react-native";
import { AppState } from "react-native";
import { useAlertStream } from "@/hooks/useAlertStream";
import { openAlertStream } from "@/lib/alertStream";
import { subscribeLive } from "@/lib/live";
import { useSession } from "@/store/session";
import * as api from "@/lib/api";
jest.mock("@/lib/alertStream", () => ({openAlertStream:jest.fn()}));
jest.mock("@/lib/api", () => ({...jest.requireActual("@/lib/api"),listNotifications:jest.fn(),me:jest.fn(),listOrders:jest.fn(async()=>[])}));
const user = {id:"owner",name:"Owner",email:"owner@test",role:"supplier" as const,verificationStatus:"pending" as const};
describe("authenticated app stream lifecycle", () => {
  let change: (state: "active" | "background") => void;
  const close = jest.fn();
  beforeEach(() => {
    jest.useFakeTimers(); jest.clearAllMocks();
    useSession.setState({user});
    (api.me as jest.Mock).mockResolvedValue(user);
    (api.listNotifications as jest.Mock).mockResolvedValue([]);
    (openAlertStream as jest.Mock).mockReturnValue({close,wake:jest.fn()});
    jest.spyOn(AppState,"addEventListener").mockImplementation((_event, callback) => {change=callback;return {remove:jest.fn()};});
  });
  afterEach(() => {jest.useRealTimers();jest.restoreAllMocks();});
  it("opens despite a failed inbox read, retries data, and reconciles every reconnect", async () => {
    (api.listNotifications as jest.Mock).mockRejectedValueOnce(new Error("offline"));
    const onResource = jest.fn(); const unsubscribe=subscribeLive(onResource);
    await renderHook(() => useAlertStream());
    expect(openAlertStream).toHaveBeenCalledTimes(1);
    await act(async () => {jest.advanceTimersByTime(100);});
    const handlers=(openAlertStream as jest.Mock).mock.calls[0][0];
    await act(async () => {handlers.onStatus(true);jest.advanceTimersByTime(100);});
    expect(api.listNotifications).toHaveBeenCalledTimes(2);
    expect(onResource).toHaveBeenCalledWith("*");
    unsubscribe();
  });
  it("closes in background and reconnects with resource reconciliation on foreground", async () => {
    await renderHook(() => useAlertStream());
    await act(async () => {change("background");});
    expect(close).toHaveBeenCalled();
    await act(async () => {change("active");});
    expect(openAlertStream).toHaveBeenCalledTimes(2);
  });
  it("rejects old stream callbacks after account switch and clears account caches", async () => {
    await renderHook(() => useAlertStream());
    const old=(openAlertStream as jest.Mock).mock.calls[0][0];
    await act(async () => {useSession.setState({user:{...user,id:"second"}});});
    const received=jest.fn();const unsubscribe=subscribeLive(received);
    old.onInvalidate({resource:"jobs"});
    old.onNotification({id:"n",userId:"owner",title:"Private"});
    expect(received).not.toHaveBeenCalled();
    unsubscribe();
  });
});

it("clears the role session when the authoritative projection revokes membership",async()=>{
  useSession.setState({user});
  (api.me as jest.Mock).mockResolvedValue({...user,role:"client"});
  await useSession.getState().refresh();
  expect(useSession.getState().user).toBeNull();
});
