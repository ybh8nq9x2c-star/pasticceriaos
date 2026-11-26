import { redirect } from 'next/navigation';

export default async function PortalIndexPage(props: { params: Promise<{ token: string }> }) {
  const params = await props.params;
  redirect(`/portal/${params.token}/orders`);
}
