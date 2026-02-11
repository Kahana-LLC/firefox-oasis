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
             <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
                <ellipse cx="16.5" cy="16" rx="12.5" ry="10.5" fill="#978455"/>
                <ellipse cx="16.5" cy="18" rx="10.5" ry="8.5" fill="#F8FAF2"/>
                <ellipse cx="10.3268" cy="18.7453" rx="2.45004" ry="5.0274" transform="rotate(46.2818 10.3268 18.7453)" fill="#978455"/>
                <circle cx="1" cy="1" r="1" transform="matrix(1 0 0 -1 12 17.5)" fill="#F8FAF2"/>
                <ellipse cx="2.45004" cy="5.0274" rx="2.45004" ry="5.0274" transform="matrix(-0.691112 0.722747 0.722747 0.691112 20.7329 13.5)" fill="#978455"/>
                <circle cx="1" cy="1" r="1" transform="matrix(1 0 0 -1 19 17.5)" fill="#F8FAF2"/>
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
                                <div style={{ fontSize: '13px', fontWeight: 500, color: '#333', overflow: 'hidden', textOverflow: 'ellipsis' }}>{auth.user?.email}</div>
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
        <HeaderBtn onClick={(e: any) => {
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
        color: '#7A9200'
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
