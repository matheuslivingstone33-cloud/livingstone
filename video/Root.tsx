import { Composition } from "remotion";
import { Hero } from "./Hero";
import { AmandaComoUsar, AMANDA_DURACAO } from "./AmandaComoUsar";

export const Root = () => (
  <>
    <Composition id="LivingstoneHero" component={Hero} durationInFrames={1440} fps={60} width={1920} height={1080} />
    <Composition id="AmandaComoUsar" component={AmandaComoUsar} durationInFrames={AMANDA_DURACAO} fps={30} width={1920} height={1080} />
  </>
);
