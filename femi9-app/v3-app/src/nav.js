import { createContext, useContext } from 'react';
export const NavCtx = createContext({ go(){}, back(){}, reset(){} });
export const useNav = () => useContext(NavCtx);
