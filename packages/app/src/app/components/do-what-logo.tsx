import type { JSX } from "solid-js";

type Props = {
    size?: number;
    class?: string;
};

export default function DoWhatLogo(props: Props): JSX.Element {
    const size = props.size ?? 24;
    return (
        <img
            src="/svg/organic/shape/star/Elements-organic-shape-star-wink.svg"
            alt="do-what"
            width={size}
            height={size}
            class={`inline-block animate-star-twinkle ${props.class ?? ""}`}
        />
    );
}
