import { Link, NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext';

export function AppShell() {
  const { user, logout } = useAuth();

  return (
    <div className="shell">
      <aside className="sidebar">
        <Link to="/" className="brand">
          Alugatek Support
        </Link>

        <nav className="menu">
          <NavLink
            to="/disputes"
            className={({ isActive }) => (isActive ? 'menu-item active' : 'menu-item')}
          >
            Disputas
          </NavLink>
          <NavLink
            to="/users/ban"
            className={({ isActive }) => (isActive ? 'menu-item active' : 'menu-item')}
          >
            Banir conta
          </NavLink>
          <NavLink
            to="/reports"
            className={({ isActive }) => (isActive ? 'menu-item active' : 'menu-item')}
          >
            Denúncias
          </NavLink>
        </nav>

        <div className="user-box">
          <div className="user-name">{user?.name}</div>
          <div className="user-role">{user?.role}</div>
          <button onClick={logout} className="secondary-btn" type="button">
            Sair
          </button>
        </div>
      </aside>

      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}
