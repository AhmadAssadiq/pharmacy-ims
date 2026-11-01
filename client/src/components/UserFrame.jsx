// The frame for pages anyone can open (Contact, 404): the normal signed-in frame when
// signed in, the signed-out frame otherwise.
import { useAuth } from '../context/AuthContext';
import AuthLayout from './AuthLayout';
import Layout from './Layout';

export default function UserFrame() {
  const { user } = useAuth();
  return user ? <Layout /> : <AuthLayout />;
}
