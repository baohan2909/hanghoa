import { IcPlus } from './Icons'

export default function Cmdbar({ tit, sub, onNhapDon, dongBo }) {
  return (
    <header className="cmdbar">
      <div className="cmd-in">
        <div className="cmd-title">
          <h2>{tit}</h2>
          <p>{sub}</p>
        </div>
        <div className="cmd-row">
          {dongBo && <span className="hd-gio"><span className="dot" />{dongBo}</span>}
          {onNhapDon &&
            <button className="btn-hd" onClick={onNhapDon}><IcPlus size={15} />Nhập đơn mới</button>}
        </div>
      </div>
    </header>
  )
}
