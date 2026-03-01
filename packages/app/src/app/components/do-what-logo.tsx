import type { JSX } from "solid-js";

type Props = {
    size?: number;
    class?: string;
};

export default function DoWhatLogo(props: Props): JSX.Element {
    const size = props.size ?? 24;
    return (
        <svg
            width={size}
            height={size}
            viewBox="0 0 64 64"
            aria-label="do-what"
            role="img"
            class={props.class ?? ""}
        >
            <defs>
                <radialGradient id="dowhat-logo-gradient" cx="30%" cy="30%" r="70%">
                    <stop offset="0%" stop-color="#8DB8FF" />
                    <stop offset="100%" stop-color="#3F7DFF" />
                </radialGradient>
            </defs>
            <circle cx="32" cy="32" r="28" fill="url(#dowhat-logo-gradient)" />
        </svg>
    );
}
