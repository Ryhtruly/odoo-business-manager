import React from 'react';
import Button from './Button';

interface PartnerTableProps {
  data: any[];
  isLoading: boolean;
  isAllowedToManage: boolean;
  nameHeader: string;
  emptyMessage: string;
  debitOrCreditField: 'debit' | 'credit';
  showDebt?: boolean;
  onEdit: (item: any) => void;
  onDeleteOrArchive: (item: any) => void;
  onRestore: (item: any) => void;
}

export const PartnerTable: React.FC<PartnerTableProps> = ({
  data,
  isLoading,
  isAllowedToManage,
  nameHeader,
  emptyMessage,
  debitOrCreditField,
  showDebt = true,
  onEdit,
  onDeleteOrArchive,
  onRestore
}) => {
  const colSpanCount = 4 + (showDebt ? 1 : 0) + (isAllowedToManage ? 1 : 0);

  return (
    <div className="responsive-table-wrapper">
      <table>
        <thead>
          <tr>
            <th>{nameHeader}</th>
            <th>Địa chỉ</th>
            <th>Số điện thoại</th>
            {showDebt && <th>Công nợ (đ)</th>}
            <th>Trạng thái</th>
            {isAllowedToManage && <th style={{ width: '150px', textAlign: 'center' }}>Thao tác</th>}
          </tr>
        </thead>
        <tbody>
          {isLoading && data.length === 0 ? (
            <tr>
              <td colSpan={colSpanCount} className="text-center">Đang tải dữ liệu...</td>
            </tr>
          ) : data.length === 0 ? (
            <tr>
              <td colSpan={colSpanCount} className="text-center">{emptyMessage}</td>
            </tr>
          ) : (
            data.map((item) => {
              const statusBadge = item.active ? (
                <span style={{ background: 'rgba(46, 204, 113, 0.1)', color: '#2ecc71', border: '1px solid rgba(46, 204, 113, 0.2)', padding: '2px 8px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 500, display: 'inline-block' }}>
                  Đang hợp tác
                </span>
              ) : (
                <span style={{ background: 'rgba(231, 76, 60, 0.1)', color: '#e74c3c', border: '1px solid rgba(231, 76, 60, 0.2)', padding: '2px 8px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 500, display: 'inline-block' }}>
                  Ngừng hợp tác
                </span>
              );

              const debtValue = Number(item[debitOrCreditField] || 0);
              const debtColor = debtValue > 0 ? 'var(--accent-danger)' : 'var(--text-muted)';
              const debtWeight = debtValue > 0 ? '600' : 'normal';

              return (
                <tr key={item.id}>
                  <td><strong>{item.name}</strong></td>
                  <td>{item.street || '-'}</td>
                  <td>{item.phone || '-'}</td>
                  {showDebt && (
                    <td>
                      <span style={{ fontWeight: debtWeight, color: debtColor }}>
                        {debtValue.toLocaleString()} đ
                      </span>
                    </td>
                  )}
                  <td>{statusBadge}</td>
                  {isAllowedToManage && (
                    <td style={{ textAlign: 'center' }}>
                      <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => onEdit(item)}
                          style={{ padding: '4px 8px', fontSize: '0.8rem', margin: 0, minHeight: 'unset', lineHeight: 1 }}
                        >
                          Sửa
                        </Button>
                        {item.active ? (
                          <Button
                            size="sm"
                            variant={item.has_transactions ? 'secondary' : 'danger'}
                            onClick={() => onDeleteOrArchive(item)}
                            style={{
                              padding: '4px 8px',
                              fontSize: '0.8rem',
                              margin: 0,
                              minHeight: 'unset',
                              lineHeight: 1,
                              ...(item.has_transactions ? { background: 'rgba(230, 126, 34, 0.1)', color: '#e67e22', borderColor: 'rgba(230,126,34,0.2)' } : {})
                            }}
                          >
                            {item.has_transactions ? 'Lưu trữ' : 'Xóa'}
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="primary"
                            onClick={() => onRestore(item)}
                            style={{
                              padding: '4px 8px',
                              fontSize: '0.8rem',
                              margin: 0,
                              minHeight: 'unset',
                              lineHeight: 1,
                              background: 'rgba(46, 204, 113, 0.1)',
                              color: '#2ecc71',
                              borderColor: 'rgba(46, 204, 113, 0.2)'
                            }}
                          >
                            Hợp tác lại
                          </Button>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
};

export default PartnerTable;
