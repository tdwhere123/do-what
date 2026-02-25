export default function ErrorCard(props: { message: string }) {
  return <div class="rounded-lg bg-red-3 text-red-11 p-3 text-xs">{props.message}</div>;
}
