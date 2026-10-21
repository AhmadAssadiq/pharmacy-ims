import { Outlet } from 'react-router-dom';

/**
 * Frame for the signed-out pages (Login, Register). They have no navigation bar,
 * but they still need the same skip link and `<main>` landmark as `Layout`, so
 * assistive technology finds the form the same way it finds every other page.
 */
export default function AuthLayout() {
  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <main className="auth-page" id="main">
        <Outlet />
      </main>
    </>
  );
}
