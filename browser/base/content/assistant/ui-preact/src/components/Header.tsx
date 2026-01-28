import { h } from 'preact';
import { useState, useEffect, useRef } from 'preact/hooks';

interface HeaderProps {
  auth: {
    isAuthenticated: boolean;
    user: any;
  };
  onShowAuth: () => void;
}

export function Header({ auth, onShowAuth }: HeaderProps) {
  const [isMaximized, setIsMaximized] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: any) {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setShowMenu(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleMinimize = (e: MouseEvent) => {
    e.preventDefault(); e.stopPropagation();
    try { window.parent.postMessage({ type: "oasisOverlayMinimize" }, "*"); } catch (err) {}
  };

  const handleExpand = (e: MouseEvent) => {
    e.preventDefault(); e.stopPropagation();
    try {
      if (isMaximized) {
        window.parent.postMessage({ type: "oasisOverlayExitFullscreen" }, "*");
        setIsMaximized(false);
      } else {
        window.parent.postMessage({ type: "oasisOverlayExpand" }, "*");
        setIsMaximized(true);
      }
    } catch (err) {}
  };

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
    if ((window as any).supabaseAuth) {
      await (window as any).supabaseAuth.signOut();
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
        <div style={{ width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
             <svg width="26" height="22" viewBox="0 0 26 22" fill="none" xmlns="http://www.w3.org/2000/svg">
                {/* Simplified Sloth Head from Figma Vector */}
                <path d="M13 0C19.6 0 25 4.5 25 10C25 15.5 19.6 20 13 20C6.4 20 1 15.5 1 10C1 4.5 6.4 0 13 0Z" fill="#978455" fillOpacity="0.2"/>
                <path d="M13 2C18 2 22 5.5 22 10C22 14.5 18 18 13 18C8 18 4 14.5 4 10C4 5.5 8 2 13 2Z" fill="#978455"/>
                <path d="M13 4C16 4 18 6.5 18 10C18 13.5 16 16 13 16C10 16 8 13.5 8 10C8 6.5 10 4 13 4Z" fill="#F8FAF2"/>
                {/* Eyes */}
                <circle cx="11" cy="9" r="1.5" fill="#4A3B20"/>
                <circle cx="15" cy="9" r="1.5" fill="#4A3B20"/>
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
                    <circle cx="5" cy="12" r="2" fill="#495800"/>
                    <circle cx="12" cy="12" r="2" fill="#495800"/>
                    <circle cx="19" cy="12" r="2" fill="#495800"/>
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
                                <div style={{ fontSize: '13px', fontWeight: 500, color: '#333', overflow: 'hidden', textOverflow: 'ellipsis' }}>{auth.user?.email}</div>
                            </div>
                            <MenuItem onClick={handleMinimize}>Minimize</MenuItem>
                            <MenuItem onClick={() => { alert('Settings coming soon'); setShowMenu(false); }}>Settings</MenuItem>
                            <MenuItem onClick={handleSignOut} style={{ color: '#e53935' }}>Sign Out</MenuItem>
                        </div>
                    ) : (
                        <div>
                             <MenuItem onClick={() => { onShowAuth(); setShowMenu(false); }}>Sign In / Sign Up</MenuItem>
                             <MenuItem onClick={handleMinimize}>Minimize</MenuItem>
                        </div>
                    )}
                </div>
            )}
        </div>

        {/* Toggle Sidebar */}
        <HeaderBtn onClick={(e: any) => {
            e.preventDefault(); e.stopPropagation();
            try { window.parent.postMessage({ type: "oasisOverlayToggleSidebar" }, "*"); } catch (err) {}
        }} title="Toggle Sidebar">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#495800" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                <line x1="15" y1="3" x2="15" y2="21"/>
            </svg>
        </HeaderBtn>
        
        {/* Close Button (Figma doesn't show it but it's essential, styling it cleanly) */}
         <HeaderBtn onClick={handleClose} title="Close" hoverColor="#ffecec">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#495800" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"/>
                <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
        </HeaderBtn>

      </div>
    </div>
  );
}

function HeaderBtn({ onClick, title, children, hoverColor }: any) {
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
        color: '#495800' // Primary Green
      }}
      onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = hoverColor || 'rgba(122, 146, 0, 0.1)')}
      onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
    >
      {children}
    </button>
  );
}

function MenuItem({ onClick, children, style }: any) {
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
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#f5f5f5')}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'white')}
        >
            {children}
        </div>
    );
}
