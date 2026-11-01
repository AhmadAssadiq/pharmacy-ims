// The two roles, and the home page each one goes to after logging in.
import constants from '../../../shared/constants.json';

export const { ROLES } = constants;

/** Landing page for each role after login. */
export function homePathForRole(role) {
  return role === ROLES.STAFF ? '/staff/inventory' : '/patient/availability';
}
