'use client';
import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import apiClient from '../api/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Droplet, Building2, Users } from 'lucide-react';

interface Stats {
  hospitals: number;
  bloodUnits: number;
  donors: number;
}

export default function DashboardHome() {
  const { user } = useAuth();
  const [stats, setStats] = useState<Stats>({ hospitals: 0, bloodUnits: 0, donors: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      const [hospitals, inventory, donors] = await Promise.all([
        apiClient.get('/hospitals'),
        apiClient.get('/inventory/blood'),
        apiClient.get('/donors')
      ]);
      const totalUnits = inventory.data.reduce((sum: number, item: any) => sum + item.units, 0);
      setStats({
        hospitals: hospitals.data.length,
        bloodUnits: totalUnits,
        donors: donors.data.length
      });
    } catch (error) {
      console.error('Error fetching stats:', error);
    } finally {
      setLoading(false);
    }
  };

  const statCards = [
    { title: 'Total Hospitals', value: stats.hospitals, icon: Building2, color: 'text-blue-600', bg: 'bg-blue-50' },
    { title: 'Blood Units Available', value: stats.bloodUnits, icon: Droplet, color: 'text-red-600', bg: 'bg-red-50' },
    { title: 'Registered Donors', value: stats.donors, icon: Users, color: 'text-green-600', bg: 'bg-green-50' },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-800">Dashboard</h1>
        <p className="text-gray-500 mt-1">Welcome back, {user?.name}</p>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {statCards.map((card) => (
          <Card key={card.title} className="hover:shadow-md transition-shadow">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-gray-500">
                {card.title}
              </CardTitle>
              <div className={`p-2 rounded-lg ${card.bg}`}>
                <card.icon className={`h-4 w-4 ${card.color}`} />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-gray-800">{card.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}