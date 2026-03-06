import { h } from 'preact';
import type { ComponentChildren, JSX } from 'preact';
import { useState, useEffect, useRef } from 'preact/hooks';
import type { AuthState, OasisWindow } from '../types';

interface HeaderProps {
  auth: AuthState;
  onShowAuth: () => void;
}

const oasisWindow: OasisWindow = window;

export function Header({ auth, onShowAuth }: HeaderProps) {
  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const userEmail =
    auth.user && typeof auth.user !== "string" ? auth.user.email : undefined;

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node | null)) {
        setShowMenu(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleClose = (e: MouseEvent) => {
    e.preventDefault(); e.stopPropagation();
    try { window.parent.postMessage({ type: "oasisOverlayClose" }, "*"); } catch (err) {}
  };

  const handleDragStart = (e: PointerEvent) => {
    if ((e.target as HTMLElement).closest('button') || (e.target as HTMLElement).closest('.dropdown-menu')) return;
    if (e.button !== 0) return;
    e.preventDefault(); e.stopPropagation();
    window.parent.postMessage({ type: "oasisOverlayDragStart", screenX: e.screenX, screenY: e.screenY }, "*");
  };

  const handleSignOut = async () => {
    if (oasisWindow.supabaseAuth) {
      await oasisWindow.supabaseAuth.signOut();
      setShowMenu(false);
    }
  };

  return (
    <div 
      onPointerDown={handleDragStart}
      style={{
        height: '48px', // Slightly taller for better touch
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '0 8px', // Figma has less padding on edges of the internal row
        background: 'transparent',
        cursor: 'grab',
        zIndex: 2147483647,
        boxSizing: 'border-box',
        userSelect: 'none',
        flexShrink: 0
      }}
    >
      {/* Left Container: Sloth + Title + Badge */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        {/* Sloth Icon */}
        <div style={{ width: 38, height: 35, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
             <svg width="38" height="35" viewBox="0 0 38 35" fill="none" xmlns="http://www.w3.org/2000/svg">
<ellipse cx="18.6362" cy="18.7971" rx="18.6362" ry="15.2912" fill="#B3B3B3"/>
<ellipse cx="18.4775" cy="18.6357" rx="14.9727" ry="11.9463" fill="white"/>
<path d="M21.1202 20.4111C21.1202 21.343 19.958 22.6175 18.5244 22.6175C17.0909 22.6175 15.9287 21.343 15.9287 20.4111C15.9287 19.4793 17.0909 19.1133 18.5244 19.1133C19.958 19.1133 21.1202 19.4793 21.1202 20.4111Z" fill="#4D4D4D"/>
<path d="M14.7307 23.2105C14.6581 23.3208 14.6707 23.4671 14.765 23.5595C15.8196 24.594 17.1174 25.1604 18.4564 25.1662C19.7952 25.1719 21.0958 24.6169 22.1559 23.592C22.251 23.5001 22.2646 23.3535 22.1926 23.2426C22.0931 23.0893 21.8769 23.0689 21.7423 23.1925C20.7904 24.0668 19.6406 24.5386 18.4581 24.5335C17.2754 24.5284 16.1279 24.0465 15.1807 23.1636C15.0471 23.0391 14.831 23.0581 14.7307 23.2105Z" fill="#4D4D4D"/>
<path d="M17.4686 4.03536C17.4686 4.03536 17.4757 3.36052 16.9209 2.95954C16.3077 2.51641 15.2572 1.90606 15.2572 1.90606C15.2572 1.90606 16.192 1.64255 16.9922 1.87694C17.6602 2.07258 17.9065 2.23275 18.4724 2.73295C19.0383 3.23315 19.0218 3.99912 19.0218 3.99912C19.0218 3.99912 19.2929 3.13902 19.2588 2.56958C19.2081 1.72071 18.4166 0.471467 18.4166 0.471467C18.4166 0.471467 19.9153 1.28042 20.4119 2.07531C20.6531 2.46135 20.797 2.69991 20.833 3.12437C20.8621 3.46606 20.8219 3.66581 20.6908 3.9821C20.5987 4.20436 20.3643 4.5155 20.3643 4.5155C20.3643 4.5155 19.5344 4.2829 18.9902 4.18973C18.401 4.08885 17.4686 4.03536 17.4686 4.03536Z" fill="#B3B3B3" stroke="#B3B3B3" stroke-width="0.318567"/>
<path d="M31.6188 27.5038C31.6188 27.5038 33.2116 22.7253 29.0702 21.2896C26.8849 20.532 21.4246 19.6991 23.336 15.8759C25.0093 12.5291 35.9194 16.832 35.9194 19.5398L31.6188 27.5038Z" fill="#B3B3B3" stroke="#B3B3B3" stroke-width="0.318567"/>
<ellipse cx="27.7158" cy="17.5204" rx="2.22997" ry="1.27427" fill="#4D4D4D"/>
<circle cx="28.1932" cy="17.0423" r="0.477851" fill="white"/>
<path d="M5.57507 27.5565C5.57507 27.5565 3.98223 22.778 8.12361 21.3423C10.309 20.5847 15.7692 19.7518 13.8578 15.9287C12.1846 12.5818 1.27441 16.8847 1.27441 19.5925L5.57507 27.5565Z" fill="#B3B3B3" stroke="#B3B3B3" stroke-width="0.318567"/>
<ellipse cx="10.1943" cy="17.5223" rx="2.22997" ry="1.27427" fill="#4D4D4D"/>
<path d="M27.0785 6.69049C27.0785 8.27395 22.7045 10.8319 19.2736 10.8319C15.8428 10.8319 11.4688 8.7518 11.4688 7.16834C11.4688 5.58488 15.8428 5.09766 19.2736 5.09766C22.7045 5.09766 27.0785 5.10703 27.0785 6.69049Z" fill="#B3B3B3"/>
<circle cx="10.6722" cy="17.0423" r="0.477851" fill="white"/>
             </svg>
        </div>
        
        {/* Title */}
        <span style={{ 
            fontSize: '20px', 
            fontWeight: 600, 
            color: '#495800', 
            fontFamily: 'system-ui, -apple-system, sans-serif' 
        }}>
            Oasis AI
        </span>

        {/* Beta Badge */}
        <div style={{
            background: '#F2F4E5',
            padding: '1px 8px',
            borderRadius: '32px',
            display: 'flex',
            alignItems: 'center'
        }}>
            <span style={{ fontSize: '12px', color: '#495800' }}>Beta</span>
        </div>
      </div>

      {/* Right Container: Menu + Toggle */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
        
        <div style={{ position: 'relative' }} ref={menuRef}>
            <HeaderBtn onClick={() => setShowMenu(!showMenu)} title="Menu">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                    <circle cx="5" cy="12" r="2" fill="#7A9200"/>
                    <circle cx="12" cy="12" r="2" fill="#7A9200"/>
                    <circle cx="19" cy="12" r="2" fill="#7A9200"/>
                </svg>
            </HeaderBtn>

             {showMenu && (
                <div className="dropdown-menu" style={{
                    position: 'absolute',
                    top: '36px',
                    right: '0',
                    background: 'white',
                    border: '1px solid #eee',
                    borderRadius: '12px',
                    boxShadow: '0 4px 20px rgba(0,0,0,0.1)',
                    width: '200px',
                    overflow: 'hidden',
                    zIndex: 1000
                }}>
                    {auth.isAuthenticated ? (
                        <div>
                            <div style={{ padding: '12px 16px', borderBottom: '1px solid #f5f5f5', background: '#fafafa' }}>
                                <div style={{ fontSize: '11px', color: '#888', marginBottom: '2px' }}>Signed in as</div>
                                <div style={{ fontSize: '13px', fontWeight: 500, color: '#333', overflow: 'hidden', textOverflow: 'ellipsis' }}>{userEmail}</div>
                            </div>
                            <MenuItem onClick={() => { alert('Settings coming soon'); setShowMenu(false); }}>Settings</MenuItem>
                            <MenuItem onClick={handleSignOut} style={{ color: '#e53935' }}>Sign Out</MenuItem>
                        </div>
                    ) : (
                        <div>
                             <MenuItem onClick={() => { onShowAuth(); setShowMenu(false); }}>Sign In / Sign Up</MenuItem>
                        </div>
                    )}
                </div>
            )}
        </div>

        {/* Toggle Sidebar */}
        <HeaderBtn onClick={(e: MouseEvent) => {
            e.preventDefault(); e.stopPropagation();
            try { window.parent.postMessage({ type: "oasisOverlayToggleSidebar" }, "*"); } catch (err) {}
        }} title="Toggle Sidebar">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M6 21C5.20435 21 4.44129 20.6839 3.87868 20.1213C3.31607 19.5587 3 18.7956 3 18V6C3 5.20435 3.31607 4.44129 3.87868 3.87868C4.44129 3.31607 5.20435 3 6 3H18C18.7956 3 19.5587 3.31607 20.1213 3.87868C20.6839 4.44129 21 5.20435 21 6V18C21 18.7956 20.6839 19.5587 20.1213 20.1213C19.5587 20.6839 18.7956 21 18 21H6ZM18 5H10V19H18C18.2652 19 18.5196 18.8946 18.7071 18.7071C18.8946 18.5196 19 18.2652 19 18V6C19 5.73478 18.8946 5.48043 18.7071 5.29289C18.5196 5.10536 18.2652 5 18 5Z" fill="#7A9200"/>
            </svg>
        </HeaderBtn>
        
        {/* Close Button (Figma doesn't show it but it's essential, styling it cleanly) */}
         <HeaderBtn onClick={handleClose} title="Close" hoverColor="#ffecec">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#7A9200" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"/>
                <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
        </HeaderBtn>

      </div>
    </div>
  );
}

type HeaderBtnProps = {
  onClick: (e: MouseEvent) => void;
  title: string;
  children: ComponentChildren;
  hoverColor?: string;
};

function HeaderBtn({ onClick, title, children, hoverColor }: HeaderBtnProps) {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        border: 0,
        background: 'transparent',
        cursor: 'pointer',
        borderRadius: '50%',
        width: '32px',
        height: '32px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        transition: 'background 0.2s',
        color: '#7A9200'
      }}
      onMouseEnter={(e: JSX.TargetedMouseEvent<HTMLButtonElement>) => (e.currentTarget.style.backgroundColor = hoverColor || 'rgba(122, 146, 0, 0.1)')}
      onMouseLeave={(e: JSX.TargetedMouseEvent<HTMLButtonElement>) => (e.currentTarget.style.backgroundColor = 'transparent')}
    >
      {children}
    </button>
  );
}

type MenuItemProps = {
  onClick: () => void;
  children: ComponentChildren;
  style?: JSX.CSSProperties;
};

function MenuItem({ onClick, children, style }: MenuItemProps) {
    return (
        <div 
            onClick={onClick}
            style={{
                padding: '10px 16px',
                fontSize: '13px',
                color: '#333',
                cursor: 'pointer',
                transition: 'background 0.1s',
                ...style
            }}
            onMouseEnter={(e: JSX.TargetedMouseEvent<HTMLDivElement>) => (e.currentTarget.style.backgroundColor = '#f5f5f5')}
            onMouseLeave={(e: JSX.TargetedMouseEvent<HTMLDivElement>) => (e.currentTarget.style.backgroundColor = 'white')}
        >
            {children}
        </div>
    );
}
