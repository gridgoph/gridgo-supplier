import * as api from "@/lib/api";
import {openAlertStream} from "@/lib/alertStream";
const OriginalXHR=global.XMLHttpRequest;
const frames: ReturnType<typeof xhr>[]=[];
function xhr() { return {readyState:1,status:0,responseText:"",onreadystatechange:null as (()=>void)|null,onerror:null as (()=>void)|null,open:jest.fn(),setRequestHeader:jest.fn(),send:jest.fn(),abort:jest.fn()}; }
async function tick() { await Promise.resolve();await Promise.resolve();await Promise.resolve(); }
beforeEach(()=>{jest.useFakeTimers();frames.length=0;global.XMLHttpRequest=jest.fn(()=>{const frame=xhr();frames.push(frame);return frame;}) as never;});
afterEach(()=>{global.XMLHttpRequest=OriginalXHR;api.setTokenProvider(null);api.setToken(null);jest.useRealTimers();});
it("refreshes bearer after 401 and clears the replay cursor after409",async()=>{
  let token=0;api.setTokenProvider(async()=>`token-${++token}`);
  const reconcile=jest.fn();
  const stream=openAlertStream({onNotification:jest.fn(),getResumeFrom:()=>"last",onResumeUnavailable:reconcile});
  await tick();
  frames[0].readyState=4;frames[0].status=401;frames[0].onreadystatechange?.();
  jest.advanceTimersByTime(2000);await tick();
  expect(frames[1].setRequestHeader).toHaveBeenCalledWith("Authorization","Bearer token-2");
  frames[1].readyState=4;frames[1].status=409;frames[1].onreadystatechange?.();await tick();
  expect(reconcile).toHaveBeenCalledTimes(1);
  jest.advanceTimersByTime(4000);await tick();
  expect(frames[2].setRequestHeader).not.toHaveBeenCalledWith("Last-Event-ID",expect.anything());
  stream.close();
});
it("does not open a socket when a closed identity's token eventually arrives",async()=>{
  let finish:(value:string)=>void=()=>{};api.setTokenProvider(()=>new Promise(resolve=>{finish=resolve;}));
  const stream=openAlertStream({onNotification:jest.fn()});stream.close();finish("old");await tick();
  expect(frames).toHaveLength(0);
});
