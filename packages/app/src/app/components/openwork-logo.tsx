import type { JSX } from "solid-js";

type Props = {
  size?: number;
  class?: string;
};

export default function OpenWorkLogo(props: Props): JSX.Element {
  const size = props.size ?? 24;
  return (
    <img
      src="/svg/organic/shape/spiral/Elements-organic-shape-spiral.svg"
      alt="do-what"
      width={size}
      height={size}
      class={`inline-block ${props.class ?? ""}`}
    />
  );
}
