import {
  createContext,
  useContext,
  useReducer,
  useCallback,
  useMemo,
  type ReactNode,
} from 'react'
import { PRODUCTS } from '../data/products'

type Items = Record<string, number>

interface State {
  items: Items
  open: boolean
  toast: { msg: string; id: number } | null
}

type Action =
  | { type: 'ADD'; id: string }
  | { type: 'SET'; id: string; qty: number }
  | { type: 'OPEN' }
  | { type: 'CLOSE' }
  | { type: 'TOAST'; msg: string }

const nameOf = (id: string) => PRODUCTS.find((p) => p.id === id)?.name ?? 'Item'

function reducer(state: State, action: Action): State {
  const nextToastId = (state.toast?.id ?? 0) + 1
  switch (action.type) {
    case 'ADD': {
      const items = { ...state.items, [action.id]: (state.items[action.id] ?? 0) + 1 }
      return { ...state, items, toast: { msg: `${nameOf(action.id)} added to bag`, id: nextToastId } }
    }
    case 'SET': {
      const items = { ...state.items }
      if (action.qty <= 0) delete items[action.id]
      else items[action.id] = action.qty
      return { ...state, items }
    }
    case 'OPEN':
      return { ...state, open: true }
    case 'CLOSE':
      return { ...state, open: false }
    case 'TOAST':
      return { ...state, toast: { msg: action.msg, id: nextToastId } }
    default:
      return state
  }
}

interface CartApi {
  items: Items
  count: number
  subtotal: number
  open: boolean
  toast: State['toast']
  add: (id: string) => void
  setQty: (id: string, qty: number) => void
  openCart: () => void
  closeCart: () => void
  notify: (msg: string) => void
}

const CartContext = createContext<CartApi | null>(null)

export function CartProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, { items: {}, open: false, toast: null })

  const { count, subtotal } = useMemo(() => {
    let count = 0
    let subtotal = 0
    for (const id in state.items) {
      const qty = state.items[id]
      count += qty
      subtotal += (PRODUCTS.find((p) => p.id === id)?.price ?? 0) * qty
    }
    return { count, subtotal }
  }, [state.items])

  const add = useCallback((id: string) => dispatch({ type: 'ADD', id }), [])
  const setQty = useCallback((id: string, qty: number) => dispatch({ type: 'SET', id, qty }), [])
  const openCart = useCallback(() => dispatch({ type: 'OPEN' }), [])
  const closeCart = useCallback(() => dispatch({ type: 'CLOSE' }), [])
  const notify = useCallback((msg: string) => dispatch({ type: 'TOAST', msg }), [])

  const value = useMemo<CartApi>(
    () => ({ items: state.items, count, subtotal, open: state.open, toast: state.toast, add, setQty, openCart, closeCart, notify }),
    [state.items, state.open, state.toast, count, subtotal, add, setQty, openCart, closeCart, notify],
  )

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useCart(): CartApi {
  const ctx = useContext(CartContext)
  if (!ctx) throw new Error('useCart must be used within CartProvider')
  return ctx
}
