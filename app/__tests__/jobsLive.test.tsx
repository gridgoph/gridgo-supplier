import { act, render, screen } from "@testing-library/react-native";
import { invalidate } from "@/lib/live";
import * as api from "@/lib/api";
import JobsScreen from "@/app/(tabs)/jobs";
jest.mock("expo-router",()=>({router:{push:jest.fn()},useFocusEffect:(callback:()=>void)=>{jest.requireActual("react").useEffect(callback,[callback]);}}));
jest.mock("react-native-safe-area-context",()=>({...jest.requireActual("react-native-safe-area-context"),useSafeAreaInsets:()=>({top:0,bottom:0,left:0,right:0})}));
jest.mock("@/lib/api",()=>({...jest.requireActual("@/lib/api"),listJobs:jest.fn()}));
jest.mock("@/components/JobCard",()=>({JobCard:({job}:{job:{title:string}})=>{const {Text}=jest.requireActual("react-native");return <Text>{job.title}</Text>;}}));
jest.mock("@/components/JobDocketRail",()=>({JobDocketRail:()=>null}));
it("adds a newly assigned job to the open Jobs screen after invalidation",async()=>{
  (api.listJobs as jest.Mock).mockResolvedValue([]);
  await render(<JobsScreen/>);
  await screen.findByText("No assignments yet");
  (api.listJobs as jest.Mock).mockResolvedValue([{id:"order_new",title:"Live print job",state:"production",timeline:[]}]);
  await act(async()=>{invalidate("jobs");});
  expect(await screen.findByText("Live print job")).toBeTruthy();
});
