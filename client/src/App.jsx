import React from 'react';
import { BrowserRouter, Routes, Route, Link, Navigate } from 'react-router-dom';
import { AuthProvider } from './lib/AuthContext.jsx';
import { useLang } from './i18n/LanguageContext.jsx';
import { Nav } from './components/Nav.jsx';
import { FaqFab } from './components/FaqFab.jsx';
import { NotificationsProvider } from './lib/NotificationsContext.jsx';
import { NotificationBanners } from './components/NotificationBanners.jsx';
import { InviteBanner } from './components/InviteBanner.jsx';
import { Home } from './pages/Home.jsx';
import { Login } from './pages/Login.jsx';
import { Register } from './pages/Register.jsx';
import { Browse } from './pages/Browse.jsx';
import { ListingDetail } from './pages/ListingDetail.jsx';
import { CreateListing } from './pages/CreateListing.jsx';
import { MyListings } from './pages/MyListings.jsx';
import { MyClaims } from './pages/MyClaims.jsx';
import { Notifications } from './pages/Notifications.jsx';
import { LanguageProvider } from './i18n/LanguageContext.jsx';
import { LocationProvider } from './location/LocationContext.jsx';
import { Profile } from './pages/Profile.jsx';
import { ForgotPassword } from './pages/ForgotPassword.jsx';
import { ResetPassword } from './pages/ResetPassword.jsx';
import { Admin } from './pages/Admin.jsx';
import { NgoPanel } from './pages/NgoPanel.jsx';
import { Recurring } from './pages/Recurring.jsx';
import { ImpactWall } from './pages/ImpactWall.jsx';
import { Faq } from './pages/Faq.jsx';

function NotFound() {
  const { t } = useLang();
  return (
    <section>
      <h1>{t('pageNotFound')}</h1>
      <p><Link to="/">{t('goHome')}</Link></p>
    </section>
  );
}

export function App() {
  return (
    <LanguageProvider>
    <LocationProvider>
    <BrowserRouter>
    <AuthProvider>
    <NotificationsProvider>
      <Nav />
      <NotificationBanners />
      <div className="container inviteWrap">
        <InviteBanner />
      </div>
      <main className="container">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/login" element={<Login />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/register" element={<Register />} />
          <Route path="/browse" element={<Browse />} />
          <Route path="/listings/new" element={<CreateListing />} />
          <Route path="/listings/:id" element={<ListingDetail />} />
          <Route path="/my-listings" element={<MyListings />} />
          <Route path="/my-claims" element={<MyClaims />} />
          <Route path="/notifications" element={<Notifications />} />
          <Route path="/dashboard" element={<Navigate to="/impact?view=mine" replace />} />
          <Route path="/impact" element={<ImpactWall />} />
          <Route path="/faq" element={<Faq />} />
          <Route path="/admin" element={<Admin />} />
          <Route path="/ngo" element={<NgoPanel />} />
          <Route path="/recurring" element={<Recurring />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/listings/:id/edit" element={<CreateListing />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>
      <FaqFab />
    </NotificationsProvider>
    </AuthProvider>
    </BrowserRouter>
    </LocationProvider>
    </LanguageProvider>
  );
}
