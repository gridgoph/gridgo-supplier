import {act,renderHook} from "@testing-library/react-native";
import {useLiveRefresh} from "@/hooks/useLiveRefresh";
import {invalidate} from "@/lib/live";
jest.mock("expo-router",()=>({useFocusEffect:(fn:()=>void)=>jest.requireActual("react").useEffect(fn,[fn])}));
it("coalesces notification and resource bursts across callback re-renders",async()=>{
  jest.useFakeTimers();const first=jest.fn();const second=jest.fn();
  const view=await renderHook((props: unknown)=>useLiveRefresh(["orders","notifications"],(props as {refresh:()=>void}).refresh),{initialProps:{refresh:first}});
  await act(async()=>{invalidate("orders");invalidate("notifications");});
  await view.rerender({refresh:second});
  await act(async()=>{jest.advanceTimersByTime(100);});
  expect(first).not.toHaveBeenCalled();expect(second).toHaveBeenCalledTimes(1);
  await view.unmount();jest.useRealTimers();
});
