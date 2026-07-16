import { useState } from 'react';
import { useNav } from './nav.js';
import { Button, Back, Close, TextInput, TextArea, Toggle, Stepper, ChipGroup } from './ui.jsx';
import {
  Bell, Mail, Lock, ChevronRight, Search as SearchIcon, Droplet, Plus, Smile,
  Package, Truck, Check, Heart, Activity, Wind, BookOpen, Star, LogOut, Shield,
  CircleHelp, MessageCircle, Sparkles, ArrowRight, Leaf,
} from 'lucide-react';

/* ---------- small helpers ---------- */
const Pad = ({ children, style, gap = 16 }) => (
  <div className="col" style={{ padding: '4px 20px 26px', gap, ...style }}>{children}</div>
);
function TopBar({ back, backTo, close, closeTo, title, right }) {
  return (
    <div className="between" style={{ padding: '6px 16px 8px' }}>
      <div style={{ width: 40 }}>{back && <Back to={backTo} />}{close && <Close to={closeTo} />}</div>
      {title && <div className="title">{title}</div>}
      <div style={{ width: 40, display: 'flex', justifyContent: 'flex-end' }}>{right}</div>
    </div>
  );
}
const Section = ({ children }) => <div className="eyebrow" style={{ margin: '6px 0 -4px' }}>{children}</div>;
function Row({ icon: Ic, label, sub, onClick, right = <ChevronRight size={18} color="var(--muted)" /> }) {
  return (
    <button className="tile press" style={{ width: '100%' }} onClick={onClick}>
      {Ic && <span className="iconhold" style={{ width: 38, height: 38 }}><Ic size={19} /></span>}
      <div className="col grow" style={{ gap: 2, alignItems: 'flex-start' }}>
        <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>{label}</span>
        {sub && <span className="sub">{sub}</span>}
      </div>
      {right}
    </button>
  );
}
function useToast() {
  const [msg, setMsg] = useState(null);
  const toast = (m) => { setMsg(m); setTimeout(() => setMsg(null), 1600); };
  const node = msg && <div className="toast">{msg}</div>;
  return [toast, node];
}

/* ================= SPLASH ================= */
export function Splash() {
  const nav = useNav();
  return (
    <button onClick={() => nav.go('O1')} style={{ height: '100%', width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
      <img src="/logo-cream.png" alt="Femi9" style={{ width: 210 }} />
      <div className="onmute" style={{ fontSize: 15 }}>Period care that actually cares.</div>
      <div className="dots" style={{ position: 'absolute', bottom: 30 }}>
        <i style={{ background: 'var(--yellow)' }} /><i style={{ background: '#ffffff44' }} /><i style={{ background: '#ffffff44' }} />
      </div>
    </button>
  );
}

/* ================= ONBOARDING ================= */
export function Welcome() {
  const nav = useNav();
  return (
    <div className="col" style={{ height: '100%', padding: '2px 24px 30px', gap: 20 }}>
      <div className="center" style={{ gap: 4, marginTop: 6 }}>
        <span style={{ fontFamily: 'var(--serif)', fontWeight: 700, fontSize: 26, color: 'var(--purple)' }}>Femi</span>
        <span style={{ fontFamily: 'var(--serif)', fontWeight: 700, fontSize: 26, color: 'var(--period)' }}>9</span>
        <Leaf size={18} color="var(--yellow-deep)" />
      </div>
      <div className="center" style={{ background: 'var(--lilac-tint)', borderRadius: 28, height: 300 }}>
        <Leaf size={90} color="var(--purple)" strokeWidth={1} opacity={.5} />
      </div>
      <div className="col center" style={{ gap: 10, textAlign: 'center' }}>
        <div className="h1" style={{ textAlign: 'center' }}>Period care that actually cares.</div>
        <div className="lead" style={{ textAlign: 'center' }}>Track your cycle, learn your body, and never run out.</div>
      </div>
      <div className="grow" />
      <Button onClick={() => nav.go('O2')}>Get started</Button>
      <button className="center" onClick={() => nav.go('A1')}><span className="link">I already have an account</span></button>
    </div>
  );
}

export function CycleSetup() {
  const nav = useNav();
  const [sel, setSel] = useState(6);
  const cells = Array.from({ length: 35 }, (_, i) => (i < 2 ? null : i - 1)).filter((d) => d === null || d <= 31);
  return (
    <div className="col" style={{ height: '100%' }}>
      <TopBar back right={<div className="dots"><i className="on" /><i /><i /><i /></div>} />
      <Pad gap={18}>
        <div className="h2">When did your last period start?</div>
        <div className="card cal">
          <div className="between" style={{ marginBottom: 10 }}><span className="sub">July 2026</span></div>
          <div className="wk" style={{ marginBottom: 4 }}>{['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => <div key={i} className="cell mut">{d}</div>)}</div>
          <div className="wk">
            {cells.map((d, i) => d === null
              ? <div key={i} className="cell" />
              : <button key={i} className={`cell press ${sel === d ? 'sel' : ''}`} onClick={() => setSel(d)}>{d}</button>)}
          </div>
        </div>
        <div className="col" style={{ gap: 12 }}>
          <div style={{ fontSize: 16, fontWeight: 600 }}>How long is your cycle usually?</div>
          <Stepper initial={28} />
        </div>
        <div className="grow" />
        <Button onClick={() => nav.go('O3')}>Continue</Button>
      </Pad>
    </div>
  );
}

export function AboutYou() {
  const nav = useNav();
  return (
    <div className="col" style={{ height: '100%' }}>
      <TopBar back right={<div className="dots"><i /><i className="on" /><i /><i /></div>} />
      <Pad gap={18}>
        <div className="h2">Tell us about you</div>
        <div className="col gap10"><div style={{ fontSize: 14, fontWeight: 600 }}>Your age</div>
          <ChipGroup options={['Under 18', '18–24', '25–34', '35–44', '45+']} initial={['25–34']} /></div>
        <div className="col gap10"><div style={{ fontSize: 14, fontWeight: 600 }}>What brings you here?</div>
          <ChipGroup multi options={['Track my cycle', 'Learn about my body', 'Fewer leaks & rashes', 'Manage PCOS']} initial={['Track my cycle']} /></div>
        <div className="col gap10"><div style={{ fontSize: 14, fontWeight: 600 }}>Symptoms you notice</div>
          <ChipGroup multi options={['Cramps', 'Bloating', 'Headache', 'Acne', 'Fatigue', 'Backache']} initial={['Cramps']} /></div>
        <div className="grow" />
        <Button onClick={() => nav.go('O4')}>Continue</Button>
      </Pad>
    </div>
  );
}

export function PadMatch() {
  const nav = useNav();
  return (
    <div className="col" style={{ height: '100%' }}>
      <TopBar back right={<div className="dots"><i /><i /><i className="on" /><i /></div>} />
      <Pad gap={16}>
        <div className="h2">Your perfect match:<br />330mm Double Wings</div>
        <div className="herocard col" style={{ gap: 12 }}>
          <span className="badge" style={{ alignSelf: 'flex-start' }}>★ Bestseller</span>
          <div className="center" style={{ background: '#ffffff22', borderRadius: 16, height: 130 }}><Droplet size={40} color="#fff" opacity={.8} /></div>
          <div style={{ fontFamily: 'var(--serif)', fontWeight: 600, fontSize: 20 }}>330mm Double Wings</div>
          <div className="onmute" style={{ fontSize: 13 }}>9 pads · 330mm · Heavy · Night + Day</div>
          <div className="between"><span className="onmute" style={{ fontSize: 13 }}>One-time price</span><span style={{ fontFamily: 'var(--serif)', fontWeight: 600, fontSize: 22 }}>Rs.225</span></div>
        </div>
        <div className="col gap10"><div style={{ fontSize: 14, fontWeight: 600 }}>Delivery cadence</div>
          <ChipGroup tint options={['Every cycle', '4 weeks', '6 weeks']} initial={['Every cycle']} /></div>
        <div className="sub">Arrives 3 days before your period, every cycle.</div>
        <div className="grow" />
        <Button onClick={() => nav.go('O5')}>Start subscription</Button>
        <button className="center" onClick={() => nav.go('O5')}><span className="sub">Maybe later</span></button>
      </Pad>
    </div>
  );
}

export function AllSet() {
  const nav = useNav();
  return (
    <div className="col" style={{ height: '100%', padding: '10px 24px 30px', gap: 16 }}>
      <div className="center" style={{ background: 'var(--lilac-tint)', width: 92, height: 92, borderRadius: 999, alignSelf: 'center', marginTop: 8 }}><Sparkles size={38} color="var(--purple)" /></div>
      <div className="col center" style={{ gap: 8, textAlign: 'center' }}>
        <div className="h2" style={{ textAlign: 'center' }}>You're all set, Priya</div>
        <div className="lead" style={{ textAlign: 'center' }}>We'll keep your predictions and pads on track.</div>
      </div>
      <div className="card col" style={{ gap: 4 }}>
        {['Period reminders', 'Pad restock alerts', 'Daily insight'].map((t, i) => (
          <div key={t} className="between" style={{ padding: '10px 0', borderTop: i ? '1px solid var(--hairline)' : 'none' }}>
            <span style={{ fontSize: 14, fontWeight: 500 }}>{t}</span><Toggle initial={i < 2} />
          </div>
        ))}
      </div>
      <div className="grow" />
      <Button onClick={() => nav.reset('T1')}>Enter femi9</Button>
    </div>
  );
}

/* ================= AUTH ================= */
export function SignIn() {
  const nav = useNav();
  return (
    <div className="col" style={{ height: '100%' }}>
      <TopBar back backTo="O1" />
      <Pad gap={16}>
        <div className="col" style={{ gap: 8 }}>
          <div className="h1">Welcome back</div>
          <div className="lead">Log in to keep your cycle and pads on track.</div>
        </div>
        <TextInput label="Email or phone" icon={Mail} placeholder="you@email.com" initial="priya@mail.com" />
        <TextInput label="Password" icon={Lock} type="password" initial="femi9pass" />
        <button style={{ alignSelf: 'flex-end' }} onClick={() => nav.go('A2')}><span className="link" style={{ fontSize: 13 }}>Forgot password?</span></button>
        <div className="grow" />
        <Button onClick={() => nav.reset('T1')}>Log in</Button>
        <div className="row" style={{ gap: 12 }}><div className="hair" /><span className="sub">or</span><div className="hair" /></div>
        <Button variant="ghost" onClick={() => nav.reset('T1')}>Continue with Google</Button>
        <div className="center" style={{ gap: 5 }}><span className="sub">New to femi9?</span><button onClick={() => nav.go('O2')}><span className="link">Get started</span></button></div>
      </Pad>
    </div>
  );
}
export function Reset() {
  const nav = useNav();
  return (
    <div className="col" style={{ height: '100%' }}>
      <TopBar back />
      <Pad gap={16}>
        <div className="h2">Reset password</div>
        <div className="lead">Enter your email and we'll send a reset link.</div>
        <TextInput label="Email" icon={Mail} placeholder="you@email.com" />
        <div className="grow" />
        <Button onClick={() => nav.go('A1')}>Send reset link</Button>
      </Pad>
    </div>
  );
}

/* ================= TODAY ================= */
const WEEK = [['S', 5, 'per'], ['M', 6, 'per'], ['T', 7, 'pred'], ['W', 8, ''], ['T', 9, 'fer'], ['F', 10, 'fer'], ['S', 11, 'sel']];
export function Today() {
  const nav = useNav();
  return (
    <Pad gap={20}>
      <div className="between" style={{ marginTop: 2 }}>
        <div className="col" style={{ gap: 2, alignItems: 'flex-start' }}>
          <div className="h2">Hi Priya</div><div className="sub">Saturday, July 11</div>
        </div>
        <button className="avatar" onClick={() => nav.go('M1')}>P</button>
      </div>
      <button className="card press between" onClick={() => nav.go('T2')}>
        <div className="col gap8 grow" style={{ alignItems: 'stretch' }}>
          <div className="between"><span style={{ fontSize: 13, fontWeight: 600 }}>This week</span><span className="sub">Cycle day 10</span></div>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            {WEEK.map(([d, n, ph]) => (
              <div key={n} className="col center" style={{ gap: 4 }}>
                <span className="sub" style={{ fontSize: 10 }}>{d}</span>
                <span className="center" style={{ width: 28, height: 28, borderRadius: 999, fontSize: 12, fontWeight: 600,
                  background: ph === 'per' ? 'var(--period)' : ph === 'pred' ? 'var(--predicted)' : ph === 'fer' ? 'var(--fertile)' : ph === 'sel' ? 'transparent' : 'var(--surface-2)',
                  color: ph && ph !== 'sel' ? '#fff' : 'var(--ink)', border: ph === 'sel' ? '2px solid var(--purple)' : 'none' }}>{n}</span>
              </div>
            ))}
          </div>
        </div>
      </button>
      <button className="herocard press between" onClick={() => nav.go('T5')} style={{ textAlign: 'left' }}>
        <div className="col" style={{ gap: 6, alignItems: 'flex-start' }}>
          <span className="badge" style={{ background: '#ffffff22', color: '#fff' }}>Follicular phase</span>
          <div style={{ fontFamily: 'var(--serif)', fontWeight: 600, fontSize: 26, lineHeight: 1.05 }}>Next period<br />in 6 days</div>
          <span className="onmute" style={{ fontSize: 12 }}>Cycle day 10 · 94% confident</span>
        </div>
        <Leaf size={54} color="#ffffff33" />
      </button>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        {[['Log period', Droplet, 'var(--period)'], ['Symptoms', Plus, 'var(--purple)'], ['Mood', Smile, 'var(--yellow)']].map(([l, Ic, c]) => (
          <button key={l} className="col center press" style={{ gap: 8 }} onClick={() => nav.go('T4')}>
            <span className="center" style={{ width: 58, height: 58, borderRadius: 999, background: 'var(--card)', border: '1px solid var(--hairline)', color: c }}><Ic size={22} /></span>
            <span className="sub">{l}</span>
          </button>
        ))}
      </div>
      <button className="herocard press col" onClick={() => nav.go('S1')} style={{ gap: 12, alignItems: 'stretch', textAlign: 'left' }}>
        <div className="eyebrow" style={{ color: 'var(--yellow)' }}>Synced to your cycle</div>
        <div className="onmute" style={{ fontSize: 14, fontWeight: 600, color: '#fff' }}>Next period in 6 days · your femi9 pack ships in 2 days</div>
        <div className="btn sm" style={{ pointerEvents: 'none' }}>Track order <ArrowRight size={16} /></div>
      </button>
      <div className="between"><span style={{ fontWeight: 600 }}>My daily insights</span><button onClick={() => nav.go('T5')}><span className="link" style={{ fontSize: 13 }}>See all</span></button></div>
      <div className="row" style={{ gap: 12 }}>
        {[['Your phase', 'You are in your follicular phase'], ['Comfort tip', 'Cramps? Try a warm compress']].map(([t, d]) => (
          <button key={t} className="card press col" style={{ flex: 1, gap: 8, alignItems: 'flex-start', background: 'var(--surface-2)' }} onClick={() => nav.go('T5')}>
            <Sparkles size={18} color="var(--purple)" /><span style={{ fontSize: 13, fontWeight: 600 }}>{t}</span><span className="sub" style={{ fontSize: 12 }}>{d}</span>
          </button>
        ))}
      </div>
    </Pad>
  );
}

export function Calendar() {
  const nav = useNav();
  const [sel, setSel] = useState(11);
  const period = [5, 6, 7];
  const cells = Array.from({ length: 35 }, (_, i) => (i < 2 ? null : i - 1)).filter((d) => d === null || d <= 31);
  return (
    <div className="col">
      <TopBar back backTo="T1" title="Calendar" />
      <Pad gap={16}>
        <div className="card cal">
          <div className="sub" style={{ marginBottom: 10 }}>July 2026</div>
          <div className="wk" style={{ marginBottom: 4 }}>{['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => <div key={i} className="cell mut">{d}</div>)}</div>
          <div className="wk">
            {cells.map((d, i) => d === null ? <div key={i} className="cell" />
              : <button key={i} className={`cell press ${sel === d ? 'sel' : period.includes(d) ? 'per' : ''}`} onClick={() => setSel(d)}>{d}</button>)}
          </div>
        </div>
        <div className="chipwrap">
          {[['Period', 'var(--period)'], ['Fertile', 'var(--fertile)'], ['Ovulation', 'var(--ovulation)'], ['PMS', 'var(--pms)']].map(([l, c]) => (
            <div key={l} className="row gap6"><span style={{ width: 10, height: 10, borderRadius: 999, background: c }} /><span className="sub">{l}</span></div>
          ))}
        </div>
        <Button variant="ghost" onClick={() => nav.go('T4')}>Edit period dates</Button>
      </Pad>
    </div>
  );
}

export function LogFlow() {
  const nav = useNav();
  const [toast, toastNode] = useToast();
  return (
    <div className="col" style={{ height: '100%' }}>
      <div className="herocard" style={{ borderRadius: '0 0 28px 28px', margin: 0 }}>
        <div className="between"><div className="eyebrow" style={{ color: 'var(--yellow)' }}>Log today</div><Close to="T1" /></div>
        <div style={{ fontFamily: 'var(--serif)', fontWeight: 600, fontSize: 26, marginTop: 8 }}>How are you feeling?</div>
        <div className="onmute" style={{ fontSize: 13, marginTop: 4 }}>Jul 11 · Cycle day 10</div>
      </div>
      <Pad gap={18} style={{ paddingTop: 18 }}>
        <div className="col gap10"><div style={{ fontWeight: 600 }}>Flow</div><ChipGroup tint options={['Light', 'Medium', 'Heavy']} initial={['Medium']} /></div>
        <div className="col gap10"><div style={{ fontWeight: 600 }}>Symptoms</div><ChipGroup multi tint options={['Cramps', 'Headache', 'Bloating', 'Acne', 'Tender breasts', 'Fatigue']} initial={['Cramps', 'Fatigue']} /></div>
        <div className="col gap10"><div style={{ fontWeight: 600 }}>Mood</div><ChipGroup tint options={['Calm', 'Happy', 'Sensitive', 'Irritable', 'Low', 'Anxious', 'Energetic']} initial={['Calm']} /></div>
        <div className="col gap10"><div style={{ fontWeight: 600 }}>Add a note</div><TextArea placeholder="Anything you'd like to remember?" rows={3} /></div>
        <Button onClick={() => { toast('Logged for today ✓'); setTimeout(() => nav.go('T1'), 900); }}>Save</Button>
      </Pad>
      {toastNode}
    </div>
  );
}

export function CycleDetail() {
  return (
    <div className="col">
      <TopBar back title="Insights" />
      <Pad gap={16}>
        <div className="h3">Your cycle</div>
        <div className="row" style={{ gap: 12 }}>
          {[['Avg cycle', '28', 'days'], ['Avg period', '5', 'days'], ['Confidence', '94', '%']].map(([l, n, u]) => (
            <div key={l} className="card col" style={{ flex: 1, gap: 2, padding: 14, alignItems: 'flex-start' }}>
              <span className="sub" style={{ fontSize: 11 }}>{l}</span>
              <span><span style={{ fontFamily: 'var(--serif)', fontWeight: 600, fontSize: 22 }}>{n}</span> <span className="sub">{u}</span></span>
            </div>
          ))}
        </div>
        <div className="card col gap12">
          <div style={{ fontWeight: 600 }}>Phases this cycle</div>
          {[['Menstrual', 'Day 1–5', 'var(--period)'], ['Follicular', 'Day 6–13', 'var(--fertile)'], ['Ovulation', 'Day 14', 'var(--ovulation)'], ['Luteal', 'Day 15–28', 'var(--pms)']].map(([p, d, c]) => (
            <div key={p} className="between"><div className="row gap8"><span style={{ width: 10, height: 10, borderRadius: 999, background: c }} /><span style={{ fontSize: 14 }}>{p}</span></div><span className="sub">{d}</span></div>
          ))}
        </div>
        <div className="card" style={{ background: 'var(--lilac-tint)', border: 'none' }}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>Why predictions can shift</div>
          <div className="sub" style={{ lineHeight: 1.5 }}>Stress, sleep and travel can move ovulation. femi9 updates your forecast as you log each day.</div>
        </div>
      </Pad>
    </div>
  );
}

export function Notifications() {
  const nav = useNav();
  const items = [
    ['Your period is likely in 6 days', 'Your next cycle is approaching — plan ahead.', 'T5', Bell, 'var(--period)'],
    ['moonchild replied to your post', '"That sounds so gentle — thank you 💛"', 'C2', MessageCircle, 'var(--purple)'],
    ['Your femi9 pack ships tomorrow', 'Order #FM-2043 · arriving in 2–3 days.', 'M2', Truck, 'var(--yellow-deep)'],
    ['Day 3 of 21-Day Cycle Sync is ready', 'Continue your gentle daily reset.', 'L2', BookOpen, 'var(--purple)'],
  ];
  return (
    <div className="col">
      <TopBar back backTo="T1" title="Notifications" right={<button><span className="link" style={{ fontSize: 12 }}>Mark all read</span></button>} />
      <Pad gap={10}>
        {items.map(([t, d, to, Ic, c]) => (
          <button key={t} className="tile press" style={{ alignItems: 'flex-start' }} onClick={() => nav.go(to)}>
            <span className="iconhold" style={{ background: c + '22', color: c }}><Ic size={18} /></span>
            <div className="col grow" style={{ gap: 3, alignItems: 'flex-start' }}><span style={{ fontSize: 13.5, fontWeight: 600, textAlign: 'left' }}>{t}</span><span className="sub" style={{ fontSize: 12, textAlign: 'left' }}>{d}</span></div>
          </button>
        ))}
      </Pad>
    </div>
  );
}

/* ================= LEARN ================= */
export function Programs() {
  const nav = useNav();
  return (
    <Pad gap={16}>
      <div className="col" style={{ gap: 2, marginTop: 2 }}><div className="eyebrow">Awareness, every day</div><div className="h2">Learn</div></div>
      <button className="input" onClick={() => nav.go('L4')} style={{ cursor: 'pointer' }}>
        <SearchIcon size={18} /><span className="sub">Search cycles, PCOS, first period…</span>
      </button>
      <button className="herocard press between" onClick={() => nav.go('L2')} style={{ textAlign: 'left' }}>
        <div className="col" style={{ gap: 4, alignItems: 'flex-start' }}>
          <div className="eyebrow" style={{ color: 'var(--yellow)' }}>Continue</div>
          <div style={{ fontWeight: 600, fontSize: 18 }}>21-Day Cycle Sync</div>
          <span className="onmute" style={{ fontSize: 12 }}>Day 3 of 21 · 5 min today</span>
        </div>
        <div className="btn sm" style={{ width: 'auto', padding: '0 16px', pointerEvents: 'none' }}>Resume</div>
      </button>
      <div className="between"><span style={{ fontWeight: 600 }}>Explore</span><span className="sub">All topics</span></div>
      {[['First Period 101', 'Start here', BookOpen], ['Bust the Period Myths', "5 things aunties told you that aren't true.", Sparkles], ['Iron & You', 'Warm water eases cramps in minutes.', Heart], ['PCOS Basics, simply explained', 'Conditions', Activity]].map(([t, d, Ic]) => (
        <button key={t} className="tile press" onClick={() => nav.go('L3')}>
          <span className="iconhold"><Ic size={20} /></span>
          <div className="col grow" style={{ gap: 2, alignItems: 'flex-start' }}><span style={{ fontSize: 14, fontWeight: 600, textAlign: 'left' }}>{t}</span><span className="sub" style={{ fontSize: 12, textAlign: 'left' }}>{d}</span></div>
          <ChevronRight size={18} color="var(--muted)" />
        </button>
      ))}
    </Pad>
  );
}
export function ProgramDetail() {
  const nav = useNav();
  return (
    <div className="col">
      <TopBar back title="Program" />
      <Pad gap={16}>
        <div className="herocard col" style={{ gap: 6 }}>
          <div className="eyebrow" style={{ color: 'var(--yellow)' }}>Guided program</div>
          <div style={{ fontFamily: 'var(--serif)', fontWeight: 600, fontSize: 24 }}>21-Day Cycle Sync</div>
          <div className="onmute" style={{ fontSize: 13 }}>21 days · 5 min a day · Day 3 of 21</div>
        </div>
        <div className="card between"><div className="col" style={{ gap: 2, alignItems: 'flex-start' }}><span style={{ fontWeight: 600 }}>You're on Day 3</span><span className="sub">3-day streak · keep the rhythm going</span></div></div>
        <Button onClick={() => nav.go('L3')}>Continue Day 3</Button>
        <div style={{ fontWeight: 600 }}>Your journey</div>
        {[['Day 1', 'Meet your cycle phases', 'Done'], ['Day 2', 'Track energy & mood', 'Done'], ['Day 3', 'Eat for your luteal phase', 'Today'], ['Day 4', 'Movement that matches you', '5 min'], ['Day 5', 'Sleep & your hormones', '5 min']].map(([d, t, s]) => (
          <button key={d} className="tile press" onClick={() => nav.go('L3')}>
            <span className="iconhold" style={{ background: s === 'Done' ? 'var(--fertile)' : 'var(--lilac-tint)', color: s === 'Done' ? '#fff' : 'var(--purple)' }}>{s === 'Done' ? <Check size={18} /> : <BookOpen size={18} />}</span>
            <div className="col grow" style={{ gap: 2, alignItems: 'flex-start' }}><span style={{ fontSize: 13, fontWeight: 600 }}>{d}</span><span className="sub" style={{ fontSize: 12 }}>{t}</span></div>
            <span className="sub" style={{ fontWeight: 600, color: s === 'Today' ? 'var(--purple)' : 'var(--muted)' }}>{s}</span>
          </button>
        ))}
      </Pad>
    </div>
  );
}
export function Lesson() {
  const nav = useNav();
  const [toast, toastNode] = useToast();
  return (
    <div className="col" style={{ height: '100%' }}>
      <TopBar back />
      <Pad gap={14}>
        <div className="eyebrow">Follicular phase</div>
        <div className="h2">Day 3 · Your follicular phase</div>
        <div className="lead">As your period ends, oestrogen begins its slow climb. This is often the week you feel your energy, focus and mood lift back up.</div>
        <div className="lead">It's a great time to start new things and train harder — your body handles higher-intensity movement well now.</div>
        <div className="card" style={{ background: 'var(--lilac-tint)', border: 'none' }}><div style={{ fontWeight: 600, marginBottom: 4 }}>Key takeaway</div><div className="sub" style={{ lineHeight: 1.5 }}>Use this high-energy week to build strength and try new routines.</div></div>
        <div className="grow" />
        <Button onClick={() => { toast('Marked as done ✓'); setTimeout(() => nav.go('L2'), 900); }}>Mark as done</Button>
      </Pad>
      {toastNode}
    </div>
  );
}
export function Search() {
  const nav = useNav();
  return (
    <div className="col">
      <div className="row" style={{ gap: 10, padding: '6px 16px 10px' }}>
        <Back backTo="L1" />
        <div className="input grow"><SearchIcon size={18} /><input autoFocus defaultValue="cramps" placeholder="Search…" /></div>
      </div>
      <Pad gap={12}>
        <div className="sub">3 results for "cramps"</div>
        {[['Cramp Relief Yoga', 'Move · 8 min', Activity], ['Why cramps happen', 'Lesson · Your body', BookOpen], ['PMS Calm Flow', 'Move · 12 min', Wind]].map(([t, c, Ic]) => (
          <button key={t} className="tile press" onClick={() => nav.go('L3')}>
            <span className="iconhold"><Ic size={20} /></span>
            <div className="col grow" style={{ gap: 2, alignItems: 'flex-start' }}><span style={{ fontSize: 14, fontWeight: 600 }}>{t}</span><span className="sub" style={{ fontSize: 12 }}>{c}</span></div>
            <ChevronRight size={18} color="var(--muted)" />
          </button>
        ))}
        <div style={{ fontWeight: 600, marginTop: 6 }}>Popular searches</div>
        <ChipGroup options={['PCOS', 'First period', 'Iron', 'Discharge']} />
      </Pad>
    </div>
  );
}

/* ================= CIRCLE ================= */
export function Circle() {
  const nav = useNav();
  const posts = [
    ['quiet_lotus', '2h', 'First period at 11 for my little sister — how do I explain it kindly?', 'First Period', 42],
    ['moonchild', '5h', 'These cramps are brutal today. What actually helps you?', 'Cramps', 56],
    ['peony23', '8h', 'Just got diagnosed with PCOS, feeling overwhelmed but hopeful.', 'PCOS', 88],
  ];
  return (
    <div style={{ position: 'relative', height: '100%' }}>
      <Pad gap={14}>
        <div className="col" style={{ gap: 2, marginTop: 2 }}><div className="h2">Circle</div><div className="sub">A gentle place to share</div></div>
        <button className="input" onClick={() => nav.go('L4')}><SearchIcon size={18} /><span className="sub">Search topics, questions…</span></button>
        <ChipGroup options={['Popular', 'Following', 'For you']} initial={['Popular']} />
        <div className="chipwrap"><ChipGroup tint options={['Cramps', 'PCOS', 'First Period', 'Irregular']} /></div>
        {posts.map(([u, t, body, tag, likes]) => (
          <button key={u} className="card press col" style={{ gap: 10, alignItems: 'stretch' }} onClick={() => nav.go('C2')}>
            <div className="row gap8"><span className="avatar" style={{ width: 32, height: 32, fontSize: 12 }}>{u[0].toUpperCase()}</span><div className="col" style={{ alignItems: 'flex-start' }}><span style={{ fontSize: 13, fontWeight: 600 }}>{u}</span><span className="sub" style={{ fontSize: 11 }}>{t} ago</span></div></div>
            <div style={{ fontSize: 13.5, lineHeight: 1.5, textAlign: 'left' }}>{body}</div>
            <div className="row gap12"><span className="chip tint" style={{ padding: '4px 10px', fontSize: 11 }}>{tag}</span><span className="sub row gap6"><Heart size={14} /> {likes}</span></div>
          </button>
        ))}
      </Pad>
      <button className="fab" onClick={() => nav.go('C3')}><Plus size={18} /> New post</button>
    </div>
  );
}
export function PostDetail() {
  const nav = useNav();
  return (
    <div className="col" style={{ height: '100%' }}>
      <TopBar back title="Post" />
      <Pad gap={14}>
        <div className="row gap8"><span className="avatar" style={{ width: 36, height: 36 }}>Q</span><div className="col" style={{ alignItems: 'flex-start' }}><span style={{ fontSize: 14, fontWeight: 600 }}>quiet_lotus</span><span className="sub" style={{ fontSize: 11 }}>Anonymous · 2h ago</span></div></div>
        <span className="chip tint" style={{ alignSelf: 'flex-start' }}>First Period</span>
        <div className="lead">First period at 11 for my little sister — how do I explain it kindly? I want her to feel safe, not scared. What worked for you?</div>
        <div className="between"><span className="sub">128 likes · 3 replies</span></div>
        <div className="hair" />
        <div style={{ fontWeight: 600 }}>Kind replies</div>
        {[['moonchild', "You're already doing the kindest thing just by asking 💛"], ['peony23', 'I made her a little care kit — pads, a chocolate, and a note.']].map(([u, r]) => (
          <div key={u} className="card flat" style={{ background: 'var(--surface-2)' }}><div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>{u}</div><div className="sub" style={{ lineHeight: 1.5 }}>{r}</div></div>
        ))}
        <Button variant="ghost" onClick={() => nav.go('C3')}>Write a reply</Button>
      </Pad>
    </div>
  );
}
export function Compose() {
  const nav = useNav();
  const [toast, toastNode] = useToast();
  return (
    <div className="col" style={{ height: '100%' }}>
      <TopBar close closeTo="C1" title="New post" right={<button onClick={() => { toast('Posted 💛'); setTimeout(() => nav.go('C1'), 900); }}><span className="link">Post</span></button>} />
      <Pad gap={14}>
        <div style={{ fontWeight: 600 }}>Choose a topic</div>
        <ChipGroup tint options={['Cramps', 'PCOS', 'First Period', 'Hygiene', 'Mood', 'Nutrition']} initial={['Cramps']} />
        <TextArea placeholder="Share something kind or ask a question…" rows={7} />
        <div className="between"><span className="sub">Kept safe &amp; moderated</span><div className="row gap8"><span className="sub">Post anonymously</span><Toggle initial /></div></div>
      </Pad>
      {toastNode}
    </div>
  );
}

/* ================= SHOP ================= */
export function Shop() {
  const nav = useNav();
  const prods = [['330mm Double Wings', 'Rs.225', 'Heavy · Night'], ['290mm Large', 'Rs.198', 'Regular · Everyday'], ['330mm Centre Wings', 'Rs.225', 'Heavy · Night'], ['290mm Starter', 'Rs.72', '3 pads · Trial']];
  return (
    <Pad gap={14}>
      <div className="col" style={{ gap: 2, marginTop: 2 }}><div className="h2">Shop</div><div className="sub">Organic period care, delivered</div></div>
      <button className="herocard press between" onClick={() => nav.go('S1')} style={{ textAlign: 'left' }}>
        <div className="col" style={{ gap: 2, alignItems: 'flex-start' }}><span style={{ fontWeight: 600 }}>Never run out</span><span className="onmute" style={{ fontSize: 12 }}>Subscribe &amp; save on every pack</span></div>
        <span className="badge">Save</span>
      </button>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        {prods.map(([n, p, d]) => (
          <button key={n} className="card press col" style={{ padding: 12, gap: 8, alignItems: 'stretch' }} onClick={() => nav.go('S2')}>
            <div className="center" style={{ background: 'var(--lilac-tint)', borderRadius: 14, height: 96 }}><Droplet size={30} color="var(--purple)" opacity={.7} /></div>
            <div style={{ fontSize: 13.5, fontWeight: 600, textAlign: 'left', minHeight: 34 }}>{n}</div>
            <div className="sub" style={{ fontSize: 11, textAlign: 'left' }}>{d}</div>
            <div className="between"><span className="serifprice" style={{ fontSize: 16 }}>{p}</span><span className="badge">Add</span></div>
          </button>
        ))}
      </div>
      <div className="card flat row gap8" style={{ background: 'var(--surface-2)', justifyContent: 'center' }}><Truck size={16} color="var(--purple)" /><span className="sub">Free shipping over Rs.999</span></div>
    </Pad>
  );
}
export function Product() {
  const nav = useNav();
  const [toast, toastNode] = useToast();
  return (
    <div className="col" style={{ height: '100%' }}>
      <TopBar back title="Product" />
      <Pad gap={14}>
        <div className="center" style={{ background: 'var(--lilac-tint)', borderRadius: 20, height: 200 }}><Droplet size={52} color="var(--purple)" opacity={.7} /></div>
        <span className="badge" style={{ alignSelf: 'flex-start' }}>★ Bestseller</span>
        <div className="between"><div className="h3">330mm Double Wings</div><div className="serifprice" style={{ fontSize: 22 }}>Rs.225</div></div>
        <div className="sub">9 pads · 330mm · Heavy · Night + Day</div>
        <ChipGroup tint options={['Organic cotton', 'Rash-free', 'Biodegradable', 'pH-safe']} />
        <div className="between"><span style={{ fontWeight: 600 }}>Quantity</span><div style={{ width: 150 }}><Stepper initial={1} min={1} max={9} unit="" /></div></div>
        <div className="card flat" style={{ background: 'var(--surface-2)' }}><div className="row gap6" style={{ marginBottom: 4 }}><Star size={14} color="var(--yellow-deep)" fill="var(--yellow)" /><span style={{ fontWeight: 600, fontSize: 13 }}>4.8 · 312 reviews</span></div><div className="sub" style={{ lineHeight: 1.5 }}>"Finally a night pad that doesn't leak. So soft I barely feel it."</div></div>
        <div className="grow" />
        <Button onClick={() => { toast('Added to cart'); setTimeout(() => nav.go('S3'), 800); }}>Add to cart</Button>
      </Pad>
      {toastNode}
    </div>
  );
}
export function Checkout() {
  const nav = useNav();
  return (
    <div className="col" style={{ height: '100%' }}>
      <TopBar back title="Checkout" />
      <Pad gap={14}>
        <div className="card col gap12">
          {[['330mm Double Wings', 'Qty 2 · 330mm', 'Rs.450'], ['290mm Starter', 'Qty 1 · 290mm', 'Rs.72']].map(([n, q, p]) => (
            <div key={n} className="between"><div className="col" style={{ alignItems: 'flex-start' }}><span style={{ fontSize: 14, fontWeight: 600 }}>{n}</span><span className="sub">{q}</span></div><span className="serifprice" style={{ fontSize: 15 }}>{p}</span></div>
          ))}
        </div>
        <div className="card between"><div className="col" style={{ alignItems: 'flex-start' }}><span style={{ fontWeight: 600 }}>Priya Sharma</span><span className="sub">14 Indiranagar 2nd Stage, Bengaluru</span></div><ChevronRight size={18} color="var(--muted)" /></div>
        <div className="col gap10"><span style={{ fontWeight: 600 }}>Payment method</span><ChipGroup options={['UPI', 'Card', 'COD']} initial={['UPI']} /></div>
        <div className="card col gap8">
          <div className="between"><span className="sub">Subtotal</span><span>Rs.522</span></div>
          <div className="between"><span className="sub">Shipping</span><span style={{ color: 'var(--fertile)' }}>Free</span></div>
          <div className="hair" /><div className="between"><span style={{ fontWeight: 600 }}>Total</span><span className="serifprice" style={{ fontSize: 18 }}>Rs.522</span></div>
        </div>
        <Button onClick={() => nav.go('S5')}>Place order · Rs.522</Button>
      </Pad>
    </div>
  );
}
export function OrderDone() {
  const nav = useNav();
  return (
    <div className="col center" style={{ height: '100%', padding: '10px 24px 30px', gap: 16 }}>
      <div className="grow" />
      <div className="center" style={{ background: 'var(--yellow)', width: 76, height: 76, borderRadius: 999 }}><Check size={38} color="var(--purple-deep)" /></div>
      <div className="h2 on" style={{ textAlign: 'center' }}>Order placed!</div>
      <div className="onmute" style={{ textAlign: 'center', fontSize: 14 }}>Thanks, Priya — your femi9 pack is on its way.</div>
      <div className="card col gap8" style={{ width: '100%' }}>
        <div className="between"><span className="sub">Order number</span><span style={{ fontWeight: 600 }}>#FM-260712</span></div>
        <div className="hair" /><div className="between"><span style={{ fontWeight: 600 }}>Total paid</span><span className="serifprice" style={{ fontSize: 18 }}>Rs.522</span></div>
      </div>
      <div className="grow" />
      <Button onClick={() => nav.reset('T1')}>Track order <ArrowRight size={18} /></Button>
      <button onClick={() => nav.reset('S1')}><span className="onmute" style={{ fontSize: 14 }}>Continue shopping</span></button>
    </div>
  );
}

/* ================= ME ================= */
export function Profile() {
  const nav = useNav();
  return (
    <Pad gap={16}>
      <div className="row gap12" style={{ marginTop: 4 }}>
        <span className="avatar" style={{ width: 64, height: 64, fontSize: 22 }}>P</span>
        <div className="col grow" style={{ gap: 2, alignItems: 'flex-start' }}><span className="h3">Priya Sharma</span><span className="sub">Member since 2026 · Bengaluru</span></div>
      </div>
      <div className="row" style={{ gap: 12 }}>
        {[['28d', 'Avg cycle'], ['6', 'Cycles tracked'], ['12', 'Day streak']].map(([n, l]) => (
          <div key={l} className="card col center" style={{ flex: 1, gap: 2, padding: 14 }}><span style={{ fontFamily: 'var(--serif)', fontWeight: 600, fontSize: 20 }}>{n}</span><span className="sub" style={{ fontSize: 11 }}>{l}</span></div>
        ))}
      </div>
      <div className="col gap8">
        <Row icon={Sparkles} label="My data & cycle history" onClick={() => nav.go('T5')} />
        <Row icon={Package} label="Orders" sub="Track & reorder" onClick={() => nav.go('M2')} />
        <Row icon={Shield} label="Privacy & anonymity" onClick={() => nav.go('M3')} />
        <Row icon={CircleHelp} label="Help & support" onClick={() => nav.go('M3')} />
        <Row icon={LogOut} label="Settings" onClick={() => nav.go('M3')} />
      </div>
    </Pad>
  );
}
export function Orders() {
  const nav = useNav();
  return (
    <div className="col">
      <TopBar back title="Orders" />
      <Pad gap={12}>
        <div className="herocard between"><div className="col" style={{ alignItems: 'flex-start' }}><div className="eyebrow" style={{ color: 'var(--yellow)' }}>Active subscription</div><span style={{ fontWeight: 600, marginTop: 4 }}>330mm Double Wings</span><span className="onmute" style={{ fontSize: 12 }}>Every cycle · Next ships Jul 12</span></div></div>
        <div style={{ fontWeight: 600 }}>Order history</div>
        {[['Jul 3, 2026', '330mm Double Wings ×1', 'Rs.225'], ['Jun 5, 2026', '330mm Double Wings ×1', 'Rs.225'], ['May 8, 2026', '290mm Starter ×2', 'Rs.144']].map(([d, n, p]) => (
          <div key={d} className="card between"><div className="col" style={{ alignItems: 'flex-start', gap: 2 }}><span style={{ fontSize: 13, fontWeight: 600 }}>{n}</span><span className="sub">{d} · Delivered</span></div><button onClick={() => nav.go('S3')}><span className="link" style={{ fontSize: 13 }}>Reorder</span></button></div>
        ))}
      </Pad>
    </div>
  );
}
export function Settings() {
  const nav = useNav();
  return (
    <div className="col">
      <TopBar back title="Settings" />
      <Pad gap={16}>
        <Section>Account</Section>
        <div className="card col gap12">
          <div className="between"><span className="sub">Name</span><span style={{ fontWeight: 500 }}>Priya Sharma</span></div>
          <div className="between"><span className="sub">Email</span><span style={{ fontWeight: 500 }}>priya@mail.com</span></div>
          <div className="between"><span className="sub">Phone</span><span style={{ fontWeight: 500 }}>+91 98••• ••210</span></div>
        </div>
        <Section>Reminders</Section>
        <div className="card col gap4">
          {['Period reminders', 'Pad restock alerts', 'Daily insight'].map((t, i) => (
            <div key={t} className="between" style={{ padding: '9px 0', borderTop: i ? '1px solid var(--hairline)' : 'none' }}><span style={{ fontSize: 14, fontWeight: 500 }}>{t}</span><Toggle initial={i < 2} /></div>
          ))}
        </div>
        <Section>Privacy</Section>
        <div className="card col gap4">
          {['Anonymous mode in Circle', 'Face ID lock'].map((t, i) => (
            <div key={t} className="between" style={{ padding: '9px 0', borderTop: i ? '1px solid var(--hairline)' : 'none' }}><span style={{ fontSize: 14, fontWeight: 500 }}>{t}</span><Toggle initial={i === 0} /></div>
          ))}
        </div>
        <Button variant="ghost" onClick={() => nav.reset('SP')}>Log out</Button>
      </Pad>
    </div>
  );
}

/* ================= fallback ================= */
export function Placeholder() {
  const nav = useNav();
  return (
    <div className="col center" style={{ height: '100%', gap: 12, padding: 24, textAlign: 'center' }}>
      <Leaf size={40} color="var(--purple)" opacity={.5} />
      <div className="h3">Coming soon</div>
      <div className="sub">This screen is being built.</div>
      <Button variant="ghost" onClick={() => nav.reset('T1')}>Go home</Button>
    </div>
  );
}
