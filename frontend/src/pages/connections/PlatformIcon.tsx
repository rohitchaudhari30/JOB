import { Globe } from 'lucide-react';

export function PlatformIcon({ platform }: { platform: string }) {
  switch (platform.toLowerCase()) {
    case 'naukri':
      return (
        <div className="w-10 h-10 rounded-2xl bg-[#091e42] text-white font-black text-base flex items-center justify-center shadow-sm">
          N
        </div>
      );
    case 'linkedin':
      return (
        <div className="w-10 h-10 rounded-2xl bg-[#0A66C2] text-white font-black text-sm flex items-center justify-center shadow-sm">
          in
        </div>
      );
    case 'greenhouse':
      return (
        <div className="w-10 h-10 rounded-2xl bg-[#008744] text-white font-black text-sm flex items-center justify-center shadow-sm">
          GH
        </div>
      );
    case 'lever':
      return (
        <div className="w-10 h-10 rounded-2xl bg-[#4F46E5] text-white font-black text-sm flex items-center justify-center shadow-sm">
          LV
        </div>
      );
    case 'workday':
      return (
        <div className="w-10 h-10 rounded-2xl bg-[#0284C7] text-white font-black text-sm flex items-center justify-center shadow-sm">
          WD
        </div>
      );
    case 'ashby':
      return (
        <div className="w-10 h-10 rounded-2xl bg-[#EA580C] text-white font-black text-sm flex items-center justify-center shadow-sm">
          AS
        </div>
      );
    default:
      return (
        <div className="w-10 h-10 rounded-2xl bg-indigo-600 text-white font-black text-sm flex items-center justify-center shadow-sm">
          <Globe className="w-5 h-5" />
        </div>
      );
  }
}
