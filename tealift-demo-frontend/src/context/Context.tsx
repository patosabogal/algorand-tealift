import { type ReactNode, createContext, useState } from 'react'
import { type Teal } from '../interfaces/interfaces'

const Context = createContext({})

interface Props {
  children: ReactNode
}

export function TealContextProvider ({ children }: Props): JSX.Element {
  const [tealContext, setTealContext] = useState<Teal>({ graph: '', tealCode: '' })
  return (
        <Context.Provider value={{ tealContext, setTealContext }}>
            {children}
        </Context.Provider>
  )
}

export default Context
