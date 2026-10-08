import pytest
from httpx import AsyncClient, ASGITransport
from backend.app.main import app

@pytest.mark.asyncio
async def test_admin_user_management_lifecycle_and_last_admin_guard():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        # 1. Admin can list users
        res_list = await ac.get("/api/users")
        assert res_list.status_code == 200
        users = res_list.json()
        assert len(users) >= 1
        
        # Verify no raw embeddings exposed
        for u in users:
            assert "embedding_vector" not in u
            assert "embedding_vector_json" not in u
            assert "model_name" in u
            assert "biometric_status" in u

        # 2. Admin can create a new operator
        new_op = {
            "user_id": "OP-TEST-MANAGED",
            "display_name": "Test Managed Operator",
            "role": "OPERATOR"
        }
        res_create = await ac.post("/api/users", json=new_op)
        assert res_create.status_code == 200
        assert res_create.json()["success"] is True

        # 3. Duplicate user_id rejected
        res_dup = await ac.post("/api/users", json=new_op)
        assert res_dup.status_code == 400
        assert "DUPLICATE_OPERATOR_ID" in res_dup.json()["detail"]

        # 4. Admin can get user detail
        res_detail = await ac.get("/api/users/OP-TEST-MANAGED")
        assert res_detail.status_code == 200
        detail = res_detail.json()
        assert detail["user_id"] == "OP-TEST-MANAGED"
        assert detail["display_name"] == "Test Managed Operator"
        assert detail["role"] == "OPERATOR"
        assert detail["status"] == "ACTIVE"
        assert "embedding_vector" not in detail

        # 5. Admin can edit user
        res_patch = await ac.patch("/api/users/OP-TEST-MANAGED", json={"display_name": "Updated Operator Name"})
        assert res_patch.status_code == 200
        assert res_patch.json()["success"] is True
        
        res_detail_updated = await ac.get("/api/users/OP-TEST-MANAGED")
        assert res_detail_updated.json()["display_name"] == "Updated Operator Name"

        # 6. Admin can disable user
        res_dis = await ac.post("/api/users/OP-TEST-MANAGED/disable")
        assert res_dis.status_code == 200
        assert res_dis.json()["status"] == "DISABLED"

        # 7. Admin can enable user
        res_en = await ac.post("/api/users/OP-TEST-MANAGED/enable")
        assert res_en.status_code == 200
        assert res_en.json()["status"] == "ACTIVE"

        # 8. Admin can start re-enrollment session
        res_reenroll = await ac.post("/api/users/OP-TEST-MANAGED/reenroll")
        assert res_reenroll.status_code == 200
        assert res_reenroll.json()["success"] is True
        assert "session" in res_reenroll.json()

        # 9. Admin can delete user
        res_del = await ac.delete("/api/users/OP-TEST-MANAGED")
        assert res_del.status_code == 200
        assert res_del.json()["success"] is True

        # Deleted user not found in active list
        res_del_get = await ac.get("/api/users/OP-TEST-MANAGED")
        assert res_del_get.status_code == 404

        # 10. LAST ACTIVE ADMIN PROTECTION
        # Verify active admins
        res_all_admins = await ac.get("/api/users")
        active_admins = [u for u in res_all_admins.json() if u["role"] == "ADMIN" and u["status"] == "ACTIVE"]
        assert len(active_admins) >= 1

        # If more than 1 admin, disable until exactly 1 admin remains
        while len(active_admins) > 1:
            adm_to_disable = active_admins.pop()
            res_dis_extra = await ac.post(f"/api/users/{adm_to_disable['user_id']}/disable")
            assert res_dis_extra.status_code == 200

        # Now exactly 1 active admin remains
        last_admin = active_admins[0]
        last_admin_id = last_admin["user_id"]

        # Try disabling the only active admin -> BLOCKED
        res_dis_admin = await ac.post(f"/api/users/{last_admin_id}/disable")
        assert res_dis_admin.status_code == 400
        assert "LAST_ACTIVE_ADMIN_PROTECTION" in res_dis_admin.json()["detail"]

        # Try demoting the only active admin to OPERATOR -> BLOCKED
        res_demote = await ac.patch(f"/api/users/{last_admin_id}", json={"role": "OPERATOR"})
        assert res_demote.status_code == 400
        assert "LAST_ACTIVE_ADMIN_PROTECTION" in res_demote.json()["detail"]

        # Try deleting the only active admin -> BLOCKED
        res_del_admin = await ac.delete(f"/api/users/{last_admin_id}")
        assert res_del_admin.status_code == 400
        assert "LAST_ACTIVE_ADMIN_PROTECTION" in res_del_admin.json()["detail"]

