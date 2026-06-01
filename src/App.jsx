import { Routes, Route } from 'react-router-dom'
import Layout from './components/Layout/Layout'
import Home from './components/Home/Home'
import MapPage from './components/Map/MapPage'
import PlayerPage from './components/PlayerPage/PlayerPage'
import PlayerEditor from './components/PlayerEditor/PlayerEditor'
import DMTools from './components/DM/DMTools'
import Questionnaire from './components/Questionnaire/Questionnaire'
import QuestionnaireBuilder from './components/Questionnaire/QuestionnaireBuilder'
import './App.css'

export default function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/map" element={<MapPage />} />
        <Route path="/player/:id" element={<PlayerPage />} />
        <Route path="/dm/player/:id" element={<PlayerEditor />} />
        <Route path="/dm/players" element={<PlayerEditor />} />
        <Route path="/dm" element={<DMTools />} />
        <Route path="/questionnaire/:id" element={<Questionnaire />} />
        <Route path="/dm/questionnaire/new" element={<QuestionnaireBuilder />} />
        <Route path="/dm/questionnaire/:id" element={<QuestionnaireBuilder />} />
      </Routes>
    </Layout>
  )
}
