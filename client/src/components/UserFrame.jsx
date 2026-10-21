import { useAuth } from '../context/AuthContext';
import AuthLayout from './AuthLayout';
import Layout from './Layout';

/**
 * The frame for pages anyone can open (GP2 addition): the normal top bar and
 * navigation when signed in, the signed-out frame otherwise. Used by the 404
 * page and the contact page; both render through its <Outlet />.
 */
export default function UserFrame() {
  const { user } = useAuth();
  return user ? <Layout /> : <AuthLayout />;
}
