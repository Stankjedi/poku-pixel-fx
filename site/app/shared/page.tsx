import './ux.css';
import { getChatGPTUser, chatGPTSignInPath } from '@/app/chatgpt-auth';
import SharedGallery from './shared-gallery';
export const dynamic = 'force-dynamic';
export default async function SharedPage() {
  const user = await getChatGPTUser();
  return <SharedGallery signedIn={!!user} signInPath={chatGPTSignInPath('/shared')} />;
}
