import { Routes, Route } from 'react-router-dom'
import Layout from './components/Layout/Layout'
import Home from './components/Home/Home'
import MapPage from './components/Map/MapPage'
import CalendarPage from './components/Calendar/CalendarPage'
import PlayerPage from './components/PlayerPage/PlayerPage'
import DowntimeChronicle from './components/DowntimeChronicle/DowntimeChronicle'
import PlayerEditor from './components/PlayerEditor/PlayerEditor'
import DMTools from './components/DM/DMTools'
import Questionnaire from './components/Questionnaire/Questionnaire'
import QuestionnaireBuilder from './components/Questionnaire/QuestionnaireBuilder'
import Login from './components/Auth/Login'
import Register from './components/Auth/Register'
import { RequireDM, RequirePlayer as RequireLogin } from './components/Auth/ProtectedRoute'
import RequirePlayer from './components/Auth/RequirePlayer'
import ProfileEditor from './components/ProfileEditor/ProfileEditor'
import ErrorBoundary from './components/common/ErrorBoundary'
import { DndLayout } from './components/dnd/DndLayout'
import { CombatPage } from './components/dnd/pages/CombatPage'
import { PlayersPage } from './components/dnd/pages/PlayersPage'
import { MonstersPage } from './components/dnd/pages/MonstersPage'
import { NpcsPage } from './components/dnd/pages/NpcsPage'
import { EncountersPage } from './components/dnd/pages/EncountersPage'
import './App.css'

export default function App() {
  return (
    <Layout>
      <ErrorBoundary>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/map" element={<MapPage />} />
          <Route path="/calendar" element={<CalendarPage />} />
          <Route path="/player/:id" element={<PlayerPage />} />
          <Route path="/player/:id/downtime" element={<RequireLogin><DowntimeChronicle /></RequireLogin>} />
        <Route path="/questionnaire/:id" element={<Questionnaire />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/profile" element={<RequirePlayer><ProfileEditor /></RequirePlayer>} />
        <Route path="/dm" element={<RequireDM><DMTools /></RequireDM>} />
        <Route path="/dm/players" element={<RequireDM><PlayerEditor /></RequireDM>} />
        <Route path="/dm/player/:id" element={<RequireDM><PlayerEditor /></RequireDM>} />
        <Route path="/dm/npc/new" element={<RequireDM><PlayerEditor /></RequireDM>} />
        <Route path="/dm/npc/:id" element={<RequireDM><PlayerEditor /></RequireDM>} />
        <Route path="/dm/questionnaire/new" element={<RequireDM><QuestionnaireBuilder /></RequireDM>} />
        <Route path="/dm/questionnaire/:id" element={<RequireDM><QuestionnaireBuilder /></RequireDM>} />
        <Route path="/dm/dnd/combat" element={<RequireDM><DndLayout><CombatPage /></DndLayout></RequireDM>} />
        <Route path="/dm/dnd/players" element={<RequireDM><DndLayout><PlayersPage /></DndLayout></RequireDM>} />
        <Route path="/dm/dnd/monsters" element={<RequireDM><DndLayout><MonstersPage /></DndLayout></RequireDM>} />
        <Route path="/dm/dnd/npcs" element={<RequireDM><DndLayout><NpcsPage /></DndLayout></RequireDM>} />
        <Route path="/dm/dnd/encounters" element={<RequireDM><DndLayout><EncountersPage /></DndLayout></RequireDM>} />
        <Route path="/dm/dnd" element={<RequireDM><DndLayout><CombatPage /></DndLayout></RequireDM>} />
        </Routes>
      </ErrorBoundary>
    </Layout>
  )
}
