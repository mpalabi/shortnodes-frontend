import { Routes, Route } from 'react-router-dom'
import Builder from './pages/Builder'
import Sandbox from './pages/Sandbox'
import Overview from './pages/Overview'

function App() {
  return (
    <Routes>
      <Route path="/" element={<Overview />} />
      <Route path="/project/:id" element={<Builder />} />
      <Route path="/project/:id/sandbox" element={<Sandbox />} />
    </Routes>
  )
}

export default App
