// ====================================================
// FuelAmpel — Mock Data
// Realistic Berlin-area stations for development/testing.
// Mirrors the Tankerkoenig API response shape exactly.
// ====================================================

import { Station } from '../utils/types';

const NOW = Date.now();
const MINUTES = 60 * 1000;

/**
 * Generate mock stations around a given location.
 * Prices, distances and freshness are varied to test all UI states.
 */
export function getMockStations(): Station[] {
  return [
    {
      id: 'mock-001',
      name: 'ARAL Tankstelle',
      brand: 'ARAL',
      street: 'Müllerstraße 12',
      place: 'Berlin',
      lat: 52.541,
      lng: 13.372,
      dist: 0.8,
      price: 1.679,
      isOpen: true,
      fetchedAt: NOW - 8 * MINUTES,
    },
    {
      id: 'mock-002',
      name: 'Shell Station',
      brand: 'Shell',
      street: 'Prenzlauer Allee 215',
      place: 'Berlin',
      lat: 52.536,
      lng: 13.429,
      dist: 1.4,
      price: 1.639, // cheaper → good candidate
      isOpen: true,
      fetchedAt: NOW - 3 * MINUTES,
    },
    {
      id: 'mock-003',
      name: 'Total Energies',
      brand: 'Total',
      street: 'Schönhauser Allee 50',
      place: 'Berlin',
      lat: 52.543,
      lng: 13.411,
      dist: 2.1,
      price: 1.699,
      isOpen: true,
      fetchedAt: NOW - 22 * MINUTES,
    },
    {
      id: 'mock-004',
      name: 'JET Tankstelle',
      brand: 'JET',
      street: 'Karl-Marx-Allee 102',
      place: 'Berlin',
      lat: 52.517,
      lng: 13.455,
      dist: 3.2,
      price: 1.629, // cheapest but furthest
      isOpen: true,
      fetchedAt: NOW - 15 * MINUTES,
    },
    {
      id: 'mock-005',
      name: 'Esso Station',
      brand: 'Esso',
      street: 'Rosenthaler Str. 8',
      place: 'Berlin',
      lat: 52.527,
      lng: 13.402,
      dist: 1.9,
      price: 1.759, // too expensive — should be filtered out
      isOpen: true,
      fetchedAt: NOW - 5 * MINUTES,
    },
    {
      id: 'mock-006',
      name: 'HEM Tankstelle',
      brand: 'HEM',
      street: 'Brunnenstraße 145',
      place: 'Berlin',
      lat: 52.531,
      lng: 13.388,
      dist: 4.5,
      price: null, // no price → should be filtered out
      isOpen: true,
      fetchedAt: NOW - 2 * MINUTES,
    },
    {
      id: 'mock-007',
      name: 'BFT Freie Tankstelle',
      brand: 'BFT',
      street: 'Ackerstraße 22',
      place: 'Berlin',
      lat: 52.529,
      lng: 13.4,
      dist: 2.8,
      price: 1.659,
      isOpen: false, // closed → should be filtered out
      fetchedAt: NOW - 1 * MINUTES,
    },
  ];
}
