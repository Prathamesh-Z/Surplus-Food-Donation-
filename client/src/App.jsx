import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Nav } from './components/Nav.jsx';
import { Home } from './pages/Home.jsx';
import { Login } from './pages/Login.jsx';
import { Register } from './pages/Register.jsx';
import { Browse } from './pages/Browse.jsx';
import { ListingDetail } from './pages/ListingDetail.jsx';
import { CreateListing } from './pages/CreateListing.jsx';
import { MyListings } from './pages/MyListings.jsx';
import { MyClaims } from './pages/MyClaims.jsx';
import { Notifications } from './pages/Notifications.jsx';
import { Dashboard } from './pages/Dashboard.jsx';
import { LanguageProvider } from './i18n/LanguageContext.jsx';
import { LocationProvider } from './location/LocationContext.jsx';
import { Profile } from './pages/Profile.jsx';
import { Admin } from './pages/Admin.jsx';
import { NgoPanel } from './pages/NgoPanel.jsx';
import { Recurring } from './pages/Recurring.jsx';
import { ImpactWall } from './pages/ImpactWall.jsx';

export function App() {
  return (
    <LanguageProvider>
    <LocationProvider>
    <BrowserRouter>
      <Nav />
      <main className="container">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/browse" element={<Browse />} />
          <Route path="/listings/new" element={<CreateListing />} />
          <Route path="/listings/:id" element={<ListingDetail />} />
          <Route path="/my-listings" element={<MyListings />} />
          <Route path="/my-claims" element={<MyClaims />} />
          <Route path="/notifications" element={<Notifications />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/impact" element={<ImpactWall />} />
          <Route path="/admin" element={<Admin />} />
          <Route path="/ngo" element={<NgoPanel />} />
          <Route path="/recurring" element={<Recurring />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="*" element={<p>Page coming in a later module.</p>} />
        </Routes>
      </main>
    </BrowserRouter>
    </LocationProvider>
    </LanguageProvider>
  );
}
