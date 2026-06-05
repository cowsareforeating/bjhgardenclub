import { Routes, Route, Navigate } from 'react-router-dom';
import { Layout } from './components/Layout';
import { MapView } from './screens/MapView';
import { TreeBedDetail } from './screens/TreeBedDetail';
import { AddTreeBed } from './screens/AddTreeBed';
import { EditTreeBed } from './screens/EditTreeBed';
import { WaterSourceDetail } from './screens/WaterSourceDetail';
import { EditWaterSource } from './screens/EditWaterSource';
import { Profile } from './screens/Profile';
import { BedCodeRedirect } from './screens/BedCodeRedirect';
import { RecordCareSession } from './screens/RecordCareSession';
import { Login } from './screens/Login';
import { Care } from './screens/Care';
import { useAuth } from './context/AuthContext';
import { Spinner } from './components/Spinner';

function RequireAuth({ children }: { children: JSX.Element }) {
  const { user, loading } = useAuth();
  if (loading) return <Spinner label="Loading…" />;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<MapView />} />
        <Route path="care" element={<Care />} />
        <Route path="bed/:id" element={<TreeBedDetail />} />
        <Route path="b/:code" element={<BedCodeRedirect />} />
        <Route path="bed/:id/care/new" element={<RequireAuth><RecordCareSession /></RequireAuth>} />
        <Route path="bed/:id/care/:sessionId/edit" element={<RequireAuth><RecordCareSession /></RequireAuth>} />
        <Route path="bed/:id/care/:sessionId/photos" element={<RequireAuth><RecordCareSession photoOnly /></RequireAuth>} />
        <Route path="add" element={<RequireAuth><AddTreeBed /></RequireAuth>} />
        <Route path="bed/:id/edit" element={<RequireAuth><EditTreeBed /></RequireAuth>} />
        <Route path="water/:id" element={<WaterSourceDetail />} />
        <Route path="water/:id/edit" element={<RequireAuth><EditWaterSource /></RequireAuth>} />
        <Route path="profile" element={<RequireAuth><Profile /></RequireAuth>} />
        <Route path="login" element={<Login />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
