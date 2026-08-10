import type { Metadata } from "next";
import { EnclosureConfigurator } from "./components/EnclosureConfigurator";

export const metadata: Metadata = {
  title: "外殼參數配置器｜殼造所",
  description: "用即時 3D 預覽說清楚你的少量 PCB 外殼需求。",
};

export default function Home() {
  return <EnclosureConfigurator />;
}
