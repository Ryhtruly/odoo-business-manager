---
name: "odoo-product-import-fix"
description: "Import sản phẩm Odoo, fix font UTF-8, dọn trùng, tạo tồn kho và combo cơ bản."
---

# odoo-product-import-fix

## Mục đích
Chuẩn hóa quy trình import danh mục sản phẩm vào Odoo bằng JSON-RPC, đặc biệt cho dữ liệu tiếng Việt. Skill này xử lý cả các lỗi thường gặp như lỗi font UTF-8, bản ghi trùng theo `default_code`, tồn kho mẫu cho hàng hóa, và combo cơ bản.

## Khi nào dùng
Dùng khi cần một hoặc nhiều việc sau:
- Import sản phẩm từ CSV/XLSX vào Odoo
- Sửa lỗi font tiếng Việt sau import
- Dọn bản ghi trùng lặp theo `default_code`
- Tạo tồn kho mẫu cho sản phẩm loại `consu`
- Cấu hình combo cơ bản cho sản phẩm loại `combo`
- Kiểm tra lại dữ liệu sau import

## Điều kiện đầu vào
Cần có:
- URL Odoo
- Tên database
- Username
- Password
- File CSV/XLSX danh mục sản phẩm

Khuyến nghị cột dữ liệu:
- `Mã sản phẩm`
- `Tên sản phẩm`
- `Loại sản phẩm`
- `Giá vốn`
- `Giá bán`
- `Đơn vị tính`
- `Ghi chú`

## Quy trình

### Bước 1: Xác thực Odoo
- Dùng endpoint `/web/session/authenticate`
- Giữ cookie session cho các lệnh sau
- Ưu tiên JSON-RPC qua `/web/dataset/call_kw/...`

### Bước 2: Kiểm tra loại sản phẩm hợp lệ
- Gọi `product.template.fields_get`
- Xác nhận các loại hợp lệ trong hệ thống đích
- Trên instance đã gặp: `consu`, `service`, `combo`
- Không giả định `product` tồn tại

### Bước 3: Chuẩn bị dữ liệu import
- Nếu dữ liệu đang ở CSV, lưu UTF-8 BOM để hạn chế lỗi font
- Nếu cần import ổn định hơn, chuyển sang `.xlsx`
- Chuẩn hóa tên cột trước khi import

### Bước 4: Import sản phẩm
- Tạo/cập nhật bằng `product.template`
- Map trường:
  - `name`
  - `default_code`
  - `type`
  - `list_price`
  - `standard_price`
  - `description`
- Với hàng `consu`, có thể bật `is_storable=true` nếu instance hỗ trợ tracking tồn kho

### Bước 5: Sửa font tiếng Việt
- Tránh đẩy chuỗi tiếng Việt qua pipeline PowerShell dễ vỡ mã hóa
- Ưu tiên Node.js hoặc môi trường gửi UTF-8 chuẩn
- Cập nhật lại theo `default_code` bằng API `write`
- Xác minh bằng `search_read`

### Bước 6: Dọn trùng lặp
- Tìm `product.template` theo `default_code`
- Nếu trùng nhiều bản ghi:
  - giữ bản có `qty_available` lớn hơn hoặc bản đúng hơn
  - xóa các bản còn lại bằng `unlink`
- Ghi log số lượng đã xóa

### Bước 7: Tạo tồn kho mẫu
- Lấy `stock.location` internal đầu tiên hoặc vị trí kho mục tiêu
- Với sản phẩm `consu`:
  - lấy `product_variant_id`
  - tạo hoặc cập nhật `stock.quant`
  - đặt `quantity=100` và `inventory_quantity_set=true`
- Kiểm tra lại `qty_available`

### Bước 8: Cấu hình combo cơ bản
- Với sản phẩm `combo`, kiểm tra `combo_ids`
- Nếu chưa có combo:
  - tạo `product.combo`
  - tạo `product.combo.item` từ 2 sản phẩm `consu` phù hợp
  - liên kết lại vào `product.template`
- Nếu hệ thống báo combo phải có ít nhất 1 choice, tạo choice trước rồi mới link

### Bước 9: Kiểm tra sau import
- Kiểm tra tổng số `product.template`
- Lấy mẫu dữ liệu bằng `search_read`
- Kiểm tra:
  - tên tiếng Việt
  - `default_code`
  - `type`
  - `is_storable`
  - `qty_available`
- Báo cáo rõ:
  - số tạo mới
  - số cập nhật
  - số trùng đã xóa
  - số tồn kho đã set
  - số lỗi còn lại

## Mẫu dữ liệu khuyên dùng
- Nhóm thời trang: quần áo, áo sơ mi, quần jean, giày thể thao, mũ, túi xách, dây nịt, vớ/tất, khăn quàng, áo khoác
- Nhóm hàng siêu thị: nước suối, nước ngọt, sữa, bánh kẹo, mì gói, gia vị, đồ vệ sinh, thực phẩm tươi, đồ hộp
- Nhóm dịch vụ: phí vận chuyển, tư vấn
- Nhóm combo: combo bữa sáng, set thời trang

## Lưu ý quan trọng
- Không tin rằng CSV luôn hiển thị đúng tiếng Việt trong terminal; kiểm tra bằng Excel/Odoo thực tế
- Odoo có thể hiển thị `consu` là Goods
- Một số instance không cho tạo combo rỗng
- `stock.quant` cần dùng `product_variant_id`, không chỉ `product.template.id`
- Sau nhiều lần thử, cần dọn trùng trước khi báo hoàn tất

## Đầu ra mong muốn
- File CSV/XLSX chuẩn tiếng Việt để import
- Sản phẩm trong Odoo hiển thị đúng tên
- Hàng `consu` có tồn kho mẫu
- Combo cơ bản hoạt động
- Báo cáo kiểm tra cuối cùng rõ ràng
