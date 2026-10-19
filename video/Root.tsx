import { Composition } from "remotion";
import { Hero } from "./Hero";

export const Root = () => (
  <Composition id="LivingstoneHero" component={Hero} durationInFrames={1440} fps={60} width={1920} height={1080} />
);
