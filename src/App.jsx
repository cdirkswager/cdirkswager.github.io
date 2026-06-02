import { Routes, Route } from 'react-router-dom'
import Layout from './components/Layout/Layout'
import Home from './components/Home/Home'
import MapPage from './components/Map/MapPage'
import PlayerPage from './components/PlayerPage/PlayerPage'
import PlayerEditor from './components/PlayerEditor/PlayerEditor'
import DMTools from './components/DM/DMTools'
import Questionnaire from './components/Questionnaire/Questionnaire'
import QuestionnaireBuilder from './components/Questionnaire/QuestionnaireBuilder'
import Login from './components/Auth/Login'
import Register from './components/Auth/Register'
import { RequireDM } from './components/Auth/ProtectedRoute'
import RequirePlayer from './components/common/RequirePlayer'
import ProfileEditor from './components/ProfileEditor/ProfileEditor'
import './App.css'

export default function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/map" element={<MapPage />} />
        <Route path="/player/:id" element={<PlayerPage />} />
        <Route path="/questionnaire/:id" element={<Questionnaire />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/profile" element={<RequirePlayer><ProfileEditor /></RequirePlayer>} />
        <Route path="/dm" element={<RequireDM><DMTools /></RequireDM>} />
        <Route path="/dm/players" element={<RequireDM><PlayerEditor /></RequireDM>} />
        <Route path="/dm/player/:id" element={<RequireDM><PlayerEditor /></RequireDM>} />
        <Route path="/dm/questionnaire/new" element={<RequireDM><QuestionnaireBuilder /></RequireDM>} />
        <Route path="/dm/questionnaire/:id" element={<RequireDM><QuestionnaireBuilder /></RequireDM>} />
      </Routes>
    </Layout>
  )
}
