import React from 'react'

/**
 * Illustrative body content for the letterhead preview. Mimics what a real
 * filled-in form will look like inside the frame: title, ref number,
 * a few labelled fields, and a signature row. Used purely for visualisation;
 * Phase C/D will replace this with the real schema-driven renderer.
 */
export default function SampleFormBody({ accentColor = '#0066B3', title = 'Stock Requisition Form' }) {
  return (
    <div className="h-full flex flex-col text-[11px] leading-[1.35] text-slate-800">
      {/* Title */}
      <div className="text-center">
        <h1
          className="text-[15px] font-bold tracking-tight"
          style={{ color: accentColor }}
        >
          {title}
        </h1>
        <div
          className="mx-auto mt-1 h-[2px] w-16 rounded-full"
          style={{ backgroundColor: accentColor }}
        />
      </div>

      {/* Ref + date row */}
      <div className="mt-3 flex items-center justify-between text-[10px] text-slate-600">
        <div>
          <span className="font-medium text-slate-700">Reference:</span>{' '}
          <span className="font-mono">STK-2026-0042</span>
        </div>
        <div>
          <span className="font-medium text-slate-700">Date:</span>{' '}
          15 May 2026
        </div>
      </div>

      {/* Section: Requester */}
      <SectionHeader title="Requester Details" accentColor={accentColor} />
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 mt-1">
        <Field label="Full Name" value="William Manzi" />
        <Field label="Department" value="ICT & Innovation" />
        <Field label="Employee ID" value="EMP-0185" />
        <Field label="Phone" value="+250 785 927 485" />
      </div>

      {/* Section: Items */}
      <SectionHeader title="Items Requested" accentColor={accentColor} />
      <table className="mt-1 w-full border border-slate-300 text-[10px]">
        <thead>
          <tr className="bg-slate-100 text-slate-700">
            <th className="text-left px-2 py-1 border-b border-slate-300">#</th>
            <th className="text-left px-2 py-1 border-b border-slate-300">Description</th>
            <th className="text-right px-2 py-1 border-b border-slate-300">Qty</th>
            <th className="text-right px-2 py-1 border-b border-slate-300">Unit</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="px-2 py-0.5 border-b border-slate-200">1</td>
            <td className="px-2 py-0.5 border-b border-slate-200">A4 Printer Paper, 80 gsm</td>
            <td className="px-2 py-0.5 border-b border-slate-200 text-right">10</td>
            <td className="px-2 py-0.5 border-b border-slate-200 text-right">Ream</td>
          </tr>
          <tr>
            <td className="px-2 py-0.5 border-b border-slate-200">2</td>
            <td className="px-2 py-0.5 border-b border-slate-200">HP 26X Toner Cartridge</td>
            <td className="px-2 py-0.5 border-b border-slate-200 text-right">2</td>
            <td className="px-2 py-0.5 border-b border-slate-200 text-right">Pcs</td>
          </tr>
          <tr>
            <td className="px-2 py-0.5">3</td>
            <td className="px-2 py-0.5">USB-C Cables (1 m)</td>
            <td className="px-2 py-0.5 text-right">5</td>
            <td className="px-2 py-0.5 text-right">Pcs</td>
          </tr>
        </tbody>
      </table>

      {/* Section: Justification */}
      <SectionHeader title="Justification" accentColor={accentColor} />
      <p className="mt-1 text-[10px] text-slate-700">
        Restocking of consumables for the ICT department following the Q2 inventory audit.
        Items are required by 20 May 2026 to meet planned maintenance windows.
      </p>

      {/* Signatures */}
      <div className="mt-auto grid grid-cols-3 gap-4 pt-3 text-[9px]">
        <SignatureBlock role="Initiator" name="W. Manzi" date="15 May 2026" accentColor={accentColor} />
        <SignatureBlock role="Line Manager" name="J. Habimana" date="16 May 2026" accentColor={accentColor} />
        <SignatureBlock role="HOD"          name="Pending"      date="—"          accentColor={accentColor} muted />
      </div>
    </div>
  )
}

function SectionHeader({ title, accentColor }) {
  return (
    <div className="mt-3 flex items-center gap-2">
      <div
        className="h-[3px] w-3 rounded-full"
        style={{ backgroundColor: accentColor }}
      />
      <h2 className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: accentColor }}>
        {title}
      </h2>
      <div className="flex-1 h-px bg-slate-200" />
    </div>
  )
}

function Field({ label, value }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <span className="text-slate-500">{label}:</span>
      <span className="font-medium text-slate-800">{value}</span>
    </div>
  )
}

function SignatureBlock({ role, name, date, accentColor, muted }) {
  return (
    <div className={muted ? 'opacity-50' : ''}>
      <div
        className="border-b border-dashed mb-1"
        style={{ borderColor: muted ? '#cbd5e1' : accentColor, opacity: 0.7 }}
      >
        <div className="font-signature italic text-[12px] pb-0.5 text-slate-700">
          {muted ? '' : name}
        </div>
      </div>
      <div className="text-slate-600">{role}</div>
      <div className="text-slate-400 text-[8px]">Date: {date}</div>
    </div>
  )
}
