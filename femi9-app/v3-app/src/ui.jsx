import { useState } from 'react';
import {
  SignalHigh, Wifi, BatteryFull, ChevronLeft, ChevronRight, X, Eye, EyeOff,
  House, BookOpen, Users, ShoppingBag, User, Minus, Plus,
} from 'lucide-react';
import { useNav } from './nav.js';

/* ---------- OS chrome ---------- */
export function StatusBar({ variant = 'light' }) {
  return (
    <div className={`statusbar ${variant}`}>
      <div className="t">9:41</div>
      <div className="ind">
        <SignalHigh size={17} /><Wifi size={17} /><BatteryFull size={22} />
      </div>
    </div>
  );
}

const TABS = [
  ['T1', 'Today', House], ['L1', 'Learn', BookOpen], ['C1', 'Circle', Users],
  ['S1', 'Shop', ShoppingBag], ['M1', 'Me', User],
];
export function TabBar({ active }) {
  const nav = useNav();
  return (
    <div className="tabbar">
      {TABS.map(([code, label, Ic]) => (
        <button key={code} className={active === code ? 'on' : ''} onClick={() => nav.reset(code)}>
          <span className="ic"><Ic size={22} strokeWidth={active === code ? 2.4 : 2} /></span>
          <span className="lab">{label}</span>
        </button>
      ))}
    </div>
  );
}

/* ---------- buttons ---------- */
export function Button({ children, onClick, variant, icon: Ic, className = '' }) {
  return (
    <button className={`btn ${variant || ''} ${className}`} onClick={onClick}>
      {children}{Ic && <Ic size={18} />}
    </button>
  );
}
export function IconButton({ icon: Ic = ChevronLeft, onClick, size = 20 }) {
  return <button className="iconbtn" onClick={onClick}><Ic size={size} /></button>;
}
export function Back({ to }) {
  const nav = useNav();
  return <IconButton icon={ChevronLeft} onClick={() => (to ? nav.go(to) : nav.back())} />;
}
export function Close({ to }) {
  const nav = useNav();
  return <IconButton icon={X} onClick={() => (to ? nav.go(to) : nav.back())} />;
}

/* ---------- inputs (self-managing) ---------- */
export function TextInput({ label, icon: Ic, placeholder, initial = '', type = 'text' }) {
  const [v, setV] = useState(initial);
  const [show, setShow] = useState(false);
  const isPw = type === 'password';
  return (
    <div className="field">
      {label && <label>{label}</label>}
      <div className="input">
        {Ic && <Ic size={18} />}
        <input
          type={isPw && !show ? 'password' : 'text'}
          placeholder={placeholder}
          value={v}
          onChange={(e) => setV(e.target.value)}
        />
        {isPw && (
          <button onClick={() => setShow((s) => !s)} style={{ display: 'flex', color: 'var(--muted)' }}>
            {show ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        )}
      </div>
    </div>
  );
}
export function TextArea({ placeholder, initial = '', rows = 5 }) {
  const [v, setV] = useState(initial);
  return <textarea className="ta" rows={rows} placeholder={placeholder} value={v} onChange={(e) => setV(e.target.value)} />;
}

/* ---------- toggle ---------- */
export function Toggle({ initial = false }) {
  const [on, setOn] = useState(initial);
  return (
    <button className={`toggle ${on ? 'on' : ''}`} onClick={() => setOn((o) => !o)}><span /></button>
  );
}

/* ---------- stepper ---------- */
export function Stepper({ initial = 28, min = 20, max = 45, unit = 'days' }) {
  const [n, setN] = useState(initial);
  return (
    <div className="stepper">
      <button className="rnd minus" onClick={() => setN((x) => Math.max(min, x - 1))}><Minus size={18} /></button>
      <div className="val"><span className="num">{n}</span><span className="sub">{unit}</span></div>
      <button className="rnd plus" onClick={() => setN((x) => Math.min(max, x + 1))}><Plus size={18} /></button>
    </div>
  );
}

/* ---------- chips ---------- */
export function ChipGroup({ options, multi = false, tint = false, initial = [] }) {
  const [sel, setSel] = useState(new Set(initial));
  const toggle = (o) => {
    setSel((prev) => {
      const n = new Set(multi ? prev : []);
      if (prev.has(o)) n.delete(o); else n.add(o);
      return n;
    });
  };
  return (
    <div className="chipwrap">
      {options.map((o) => (
        <button key={o} className={`chip ${tint ? 'tint' : ''} ${sel.has(o) ? 'on' : ''}`} onClick={() => toggle(o)}>{o}</button>
      ))}
    </div>
  );
}

export { ChevronLeft, ChevronRight, X };
