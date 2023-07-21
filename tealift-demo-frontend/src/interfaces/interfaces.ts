export interface Teal {
  tealCode: string
  graph: string
  errorLog: string
}

export interface TealContextType {
  tealContext: Teal
  setTealContext: (value: Teal) => void
}

export type Graph = string

export interface GraphState {
  graph: Graph
  setGraph: (value: Graph) => void
}
