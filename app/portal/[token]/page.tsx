import { redirect } from 'next/navigation';

export default function PortalIndexPage({ params }: { params: { token: string } }) {
  redirect(`/portal/${params.token}/orders`);
}
