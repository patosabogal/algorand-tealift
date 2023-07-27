import { type ReactNode, createContext, useState } from 'react'
import { TealContextType, type Teal } from '../interfaces/interfaces'

const EMPTY_TEAL: Teal = { graph: '', tealCode: '', errorLog: '' }
const Context = createContext<TealContextType>({
  tealContext: EMPTY_TEAL,
  setTealContext() {}
})

interface Props {
  children: ReactNode
}

export function TealContextProvider ({ children }: Props): JSX.Element {
  const [tealContext, setTealContext] = useState<Teal>(EMPTY_TEAL)
  return (
        <Context.Provider value={{ tealContext, setTealContext }}>
            {children}
        </Context.Provider>
  )
}

export default Context
