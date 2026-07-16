import { useState } from 'react';
import { NavCtx } from './nav.js';
import { StatusBar, TabBar } from './ui.jsx';
import * as Sc from './screens.jsx';

const REG = {
  SP: [Sc.Splash, { status: 'on', dark: 1 }],
  O1: [Sc.Welcome], O2: [Sc.CycleSetup], O3: [Sc.AboutYou], O4: [Sc.PadMatch], O5: [Sc.AllSet],
  A1: [Sc.SignIn], A2: [Sc.Reset],
  T1: [Sc.Today, { hub: 'T1' }], T2: [Sc.Calendar, { hub: 'T1' }], T4: [Sc.LogFlow], T5: [Sc.CycleDetail],
  N1: [Sc.Notifications],
  L1: [Sc.Programs, { hub: 'L1' }], L2: [Sc.ProgramDetail], L3: [Sc.Lesson], L4: [Sc.Search],
  C1: [Sc.Circle, { hub: 'C1' }], C2: [Sc.PostDetail], C3: [Sc.Compose],
  S1: [Sc.Shop, { hub: 'S1' }], S2: [Sc.Product], S3: [Sc.Checkout], S5: [Sc.OrderDone, { status: 'on', dark: 1 }],
  M1: [Sc.Profile, { hub: 'M1' }], M2: [Sc.Orders], M3: [Sc.Settings],
};

export default function App() {
  const [stack, setStack] = useState(['SP']);
  const code = stack[stack.length - 1];
  const nav = {
    go: (c) => setStack((s) => [...s, c]),
    back: () => setStack((s) => (s.length > 1 ? s.slice(0, -1) : s)),
    reset: (c) => setStack([c]),
  };
  const [Comp, meta = {}] = REG[code] || [Sc.Placeholder, {}];

  return (
    <NavCtx.Provider value={nav}>
      <div className="stage">
        <div className="stage-top">
          <img src="/logo.png" alt="femi9" />
          <div className="stage-hint">V3 · functional app — tap, type &amp; toggle</div>
        </div>
        <div className="phone">
          <div className={`viewport ${meta.dark ? 'dark' : ''}`}>
            <StatusBar variant={meta.status || 'light'} />
            <div className="scroll anim" key={code}>
              <Comp />
            </div>
            {meta.hub && <TabBar active={meta.hub} />}
          </div>
        </div>
      </div>
    </NavCtx.Provider>
  );
}
